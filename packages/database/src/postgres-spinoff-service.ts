import { Money, Quantity, Rate, type Currency } from "@stockpile/core";
import { addReorganizationPosition, allocateSpinoffBasis, applySplit, emptyPositionCostBasis, type EnvironmentId } from "@stockpile/ledger";
import type { SpinoffAction } from "@stockpile/market-data";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOutbox } from "./postgres-outbox.js";

interface PositionRow extends QueryResultRow { position_account_id: string; scope: "CAREER" | "LEAGUE"; currency: Currency;
  quantity: string; remaining_cost: string; realized_gain_loss: string; version: string; }
interface BasisRow extends QueryResultRow { currency: Currency; quantity: string; remaining_cost: string; realized_gain_loss: string; }
interface OrderRow extends QueryResultRow { id: string; side: "BUY" | "SELL"; status: string; }
export interface ApplySpinoffResult { readonly positionsChanged: number; readonly ordersCancelled: number; }

export class PostgresSpinoffService {
  readonly #outbox: PostgresOutbox;
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) { this.#outbox = new PostgresOutbox(pool, nextId); }

  async apply(environmentId: EnvironmentId, action: SpinoffAction, appliedAt: string, ruleset: string): Promise<ApplySpinoffResult> {
    validate(action, appliedAt, ruleset);
    const childSecurityId = action.childSecurityId!;
    const childRatio = action.childRatio!;
    const childBasisPercentage = oneMinus(action.parentBasisPercentage!);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO corporate_actions (source_action_id,security_id,action_type,effective_date,terms,market_data_reference,detected_at)
        VALUES ($1,$2,'SPINOFF',$3,$4,$5,$6) ON CONFLICT (source_action_id) DO NOTHING`,
      [action.id,action.securityId,action.effectiveDate,{childSecurityId,childRatio,parentBasisPercentage:action.parentBasisPercentage},action.reference,appliedAt]);
      const child = await client.query("SELECT id FROM securities WHERE id=$1 AND trading_status='ACTIVE' FOR UPDATE", [childSecurityId]);
      if (child.rowCount !== 1) throw new Error("Spin-off child security is unavailable");
      const orders = await client.query<OrderRow>(`SELECT id,side,status FROM orders WHERE environment_id=$1 AND security_id=$2
        AND status IN ('PENDING_VERIFIED_PRICE','PENDING_MARKET_OPEN','OPEN') ORDER BY id FOR UPDATE`, [environmentId,action.securityId]);
      for (const order of orders.rows) await cancelOrder(client, order, action.id, appliedAt, this.nextId());
      const positions = await client.query<PositionRow>(`SELECT basis.position_account_id,account.scope,basis.currency,basis.quantity::text,
        basis.remaining_cost::text,basis.realized_gain_loss::text,basis.version::text FROM position_cost_basis basis
        JOIN position_accounts account ON account.id=basis.position_account_id WHERE account.environment_id=$1
        AND basis.security_id=$2 AND basis.quantity>0 ORDER BY basis.position_account_id FOR UPDATE OF basis`, [environmentId,action.securityId]);
      let positionsChanged = 0;
      for (const row of positions.rows) {
        const replay = await client.query(`SELECT 1 FROM corporate_action_applications WHERE environment_id=$1 AND scope=$2
          AND source_action_id=$3 AND position_account_id=$4`, [environmentId,row.scope,action.id,row.position_account_id]);
        if (replay.rowCount === 1) continue;
        const parent = { quantity: Quantity.of(row.quantity), remainingCost: Money.of(row.remaining_cost,row.currency),
          realizedGainLoss: Money.of(row.realized_gain_loss,row.currency) };
        const allocation = allocateSpinoffBasis(parent, childBasisPercentage);
        const childQuantity = multiply(parent.quantity, childRatio, row.currency);
        const existingChild = await client.query<BasisRow>(`SELECT currency,quantity::text,remaining_cost::text,realized_gain_loss::text
          FROM position_cost_basis WHERE position_account_id=$1 AND security_id=$2 FOR UPDATE`, [row.position_account_id,childSecurityId]);
        const childRow = existingChild.rows[0];
        const childPosition = childRow ? {quantity:Quantity.of(childRow.quantity),remainingCost:Money.of(childRow.remaining_cost,childRow.currency),
          realizedGainLoss:Money.of(childRow.realized_gain_loss,childRow.currency)} : emptyPositionCostBasis(row.currency);
        const updatedChild = addReorganizationPosition(childPosition, childQuantity, allocation.childCost);
        const eventId = this.nextId();
        const effectiveAt = `${action.effectiveDate}T00:00:00.000Z`;
        await client.query(`INSERT INTO financial_events (id,environment_id,scope,event_type,status,business_effective_at,created_at,posted_at,
          source_type,source_id,idempotency_key,correlation_id,economy_ruleset_version,market_data_reference,metadata)
          VALUES ($1,$2,$3,'SPINOFF','POSTED',$4,$5,$5,'CORPORATE_ACTION',$6,$7,$8,$9,$10,$11)`,
        [eventId,environmentId,row.scope,effectiveAt,appliedAt,action.id,`spinoff:${action.id}:${row.position_account_id}`,
          this.nextId(),ruleset,action.reference,{childRatio,parentBasisPercentage:action.parentBasisPercentage,childBasisPercentage}]);
        await client.query(`INSERT INTO security_quantity_entries (id,financial_event_id,environment_id,scope,position_account_id,security_id,
          quantity_delta,effective_at,entry_type,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SPINOFF_IN',$9)`,
        [this.nextId(),eventId,environmentId,row.scope,row.position_account_id,childSecurityId,childQuantity.toString(),effectiveAt,{actionId:action.id,childRatio}]);
        const parentUpdated = await client.query(`UPDATE position_cost_basis SET remaining_cost=$3,version=version+1,updated_at=$4
          WHERE position_account_id=$1 AND security_id=$2 AND version=$5`,
        [row.position_account_id,action.securityId,allocation.parent.remainingCost.toString(),appliedAt,row.version]);
        if (parentUpdated.rowCount !== 1) throw new Error("Spin-off parent cost-basis version conflict");
        await client.query(`INSERT INTO position_cost_basis (position_account_id,security_id,currency,quantity,remaining_cost,realized_gain_loss,version,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT (position_account_id,security_id) DO UPDATE SET quantity=$4,remaining_cost=$5,
          realized_gain_loss=$6,version=position_cost_basis.version+1,updated_at=$7`,
        [row.position_account_id,childSecurityId,row.currency,updatedChild.quantity.toString(),updatedChild.remainingCost.toString(),updatedChild.realizedGainLoss.toString(),appliedAt]);
        await client.query(`INSERT INTO corporate_action_basis_transfers (id,financial_event_id,environment_id,scope,source_position_account_id,
          source_security_id,target_position_account_id,target_security_id,amount,currency,allocation_method,ruleset_version,metadata,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$5,$7,$8,$9,'PROVIDER_ALLOCATION',$10,$11,$12)`,
        [this.nextId(),eventId,environmentId,row.scope,row.position_account_id,action.securityId,childSecurityId,allocation.childCost.toString(),
          row.currency,ruleset,{parentBasisPercentage:action.parentBasisPercentage},appliedAt]);
        await client.query(`INSERT INTO corporate_action_applications (id,environment_id,scope,source_action_id,position_account_id,financial_event_id,applied_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [this.nextId(),environmentId,row.scope,action.id,row.position_account_id,eventId,appliedAt]);
        await this.#outbox.enqueueUsingClient(client,{environmentId,eventType:"SpinoffApplied",payload:{financialEventId:eventId,
          positionAccountId:row.position_account_id,actionId:action.id,childSecurityId},destination:"DISCORD",availableAt:appliedAt,maxAttempts:8,
          idempotencyKey:`spinoff:${action.id}:${row.position_account_id}`});
        positionsChanged += 1;
      }
      await client.query("COMMIT");
      return Object.freeze({positionsChanged,ordersCancelled:orders.rows.length});
    } catch(error) { try { await client.query("ROLLBACK"); } catch { /* preserve original */ } throw error; }
    finally { client.release(); }
  }
}

function validate(action: SpinoffAction, at: string, ruleset: string) {
  if (!action.termsComplete || !action.childSecurityId || !action.childRatio || action.parentBasisPercentage===undefined) throw new Error("Complete spin-off terms are required");
  if (Number.isNaN(Date.parse(at)) || !ruleset.trim()) throw new Error("Spin-off time and ruleset are required");
  oneMinus(action.parentBasisPercentage);
}
function oneMinus(parent: string): string {
  return Rate.of(parent).complement().toString();
}
function multiply(quantity: Quantity, ratio: string, currency: Currency): Quantity {
  return applySplit(addReorganizationPosition(emptyPositionCostBasis(currency),quantity,Money.zero(currency)),ratio).position.quantity;
}
async function cancelOrder(client:PgClientLike,order:OrderRow,actionId:string,at:string,id:string){
  const table=order.side==="BUY"?"cash_reservations":"share_reservations";
  const released=await client.query(`UPDATE ${table} SET status='RELEASED',resolved_at=$2,version=version+1 WHERE order_id=$1 AND status='ACTIVE'`,[order.id,at]);
  if(released.rowCount!==1)throw new Error("Active spin-off-affected reservation not found");
  await client.query("UPDATE orders SET status='CANCELLED',updated_at=$2,version=version+1 WHERE id=$1",[order.id,at]);
  await client.query(`INSERT INTO order_events (id,order_id,from_status,to_status,reason,effective_at,idempotency_key,metadata)
    VALUES ($1,$2,$3,'CANCELLED','CORPORATE_ACTION',$4,$5,$6)`,[id,order.id,order.status,at,`spinoff-cancel:${actionId}:${order.id}`,{actionId}]);
}
