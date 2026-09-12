import { Money, Quantity, Rate, convertForeignTrade, type Currency } from "@stockpile/core";
import { addReorganizationPosition, applySplit, emptyPositionCostBasis, settleReorganization, type EnvironmentId } from "@stockpile/ledger";
import type { MergerAction } from "@stockpile/market-data";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOutbox } from "./postgres-outbox.js";

interface PositionRow extends QueryResultRow {
  position_account_id: string; scope: "CAREER" | "LEAGUE"; owner_id: string; cash_account_id: string;
  base_currency: Currency; quantity: string; remaining_cost: string; realized_gain_loss: string; version: string;
}
interface BasisRow extends QueryResultRow { currency: Currency; quantity: string; remaining_cost: string; realized_gain_loss: string; version: string; }
interface OrderRow extends QueryResultRow { id: string; side: "BUY" | "SELL"; status: string; }

export interface MergerFxEvidence { readonly basePerForeignRate: Rate; readonly reference: string; }
export interface SettleMergerResult { readonly positionsSettled: number; readonly ordersCancelled: number; }

export class PostgresMergerService {
  readonly #outbox: PostgresOutbox;
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {
    this.#outbox = new PostgresOutbox(pool, nextId);
  }

  async settle(environmentId: EnvironmentId, action: MergerAction, appliedAt: string, ruleset: string, fx?: MergerFxEvidence): Promise<SettleMergerResult> {
    validate(action, appliedAt, ruleset);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO corporate_actions (source_action_id,security_id,action_type,effective_date,terms,market_data_reference,detected_at)
         VALUES ($1,$2,'MERGER',$3,$4,$5,$6) ON CONFLICT (source_action_id) DO NOTHING`,
        [action.id, action.securityId, action.effectiveDate, mergerTerms(action), action.reference, appliedAt],
      );
      const orders = await client.query<OrderRow>(
        `SELECT id,side,status FROM orders WHERE environment_id=$1 AND security_id=$2
         AND status IN ('PENDING_VERIFIED_PRICE','PENDING_MARKET_OPEN','OPEN') ORDER BY id FOR UPDATE`,
        [environmentId, action.securityId],
      );
      for (const order of orders.rows) await cancelOrder(client, order, action.id, appliedAt, this.nextId());
      const positions = await client.query<PositionRow>(
        `SELECT basis.position_account_id,account.scope,account.owner_id,cash.id AS cash_account_id,
                environment.base_currency,basis.quantity::text,basis.remaining_cost::text,
                basis.realized_gain_loss::text,basis.version::text
         FROM position_cost_basis basis
         JOIN position_accounts account ON account.id=basis.position_account_id
         JOIN environments environment ON environment.id=account.environment_id
         JOIN ledger_accounts cash ON cash.environment_id=account.environment_id AND cash.scope=account.scope
           AND cash.owner_id=account.owner_id AND cash.kind='PLAYER_CASH'
         WHERE account.environment_id=$1 AND basis.security_id=$2 AND basis.quantity>0
         ORDER BY basis.position_account_id FOR UPDATE OF basis,account,cash`,
        [environmentId, action.securityId],
      );
      let positionsSettled = 0;
      for (const position of positions.rows) {
        if (await this.settlePosition(client, environmentId, position, action, appliedAt, ruleset, fx)) positionsSettled += 1;
      }
      await client.query(
        `UPDATE securities SET trading_status='DELISTED',eligible_for_trading=false,
         last_supported_date=$2::timestamptz::date,updated_at=$3 WHERE id=$1`,
        [action.securityId, `${action.effectiveDate}T00:00:00.000Z`, appliedAt],
      );
      await client.query("COMMIT");
      return Object.freeze({ positionsSettled, ordersCancelled: orders.rows.length });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }

  private async settlePosition(client: PgClientLike, environmentId: EnvironmentId, row: PositionRow, action: MergerAction,
    appliedAt: string, ruleset: string, fx?: MergerFxEvidence): Promise<boolean> {
    const prior = await client.query(
      `SELECT 1 FROM corporate_action_applications WHERE environment_id=$1 AND scope=$2
       AND source_action_id=$3 AND position_account_id=$4`,
      [environmentId, row.scope, action.id, row.position_account_id],
    );
    if (prior.rowCount === 1) return false;
    const quantity = Quantity.of(row.quantity);
    const oldPosition = { quantity, remainingCost: Money.of(row.remaining_cost, row.base_currency),
      realizedGainLoss: Money.of(row.realized_gain_loss, row.base_currency) };
    const listingCash = action.cashPerShare?.notional(quantity) ?? Money.zero(row.base_currency);
    const baseCash = convertCash(listingCash, row.base_currency, fx);
    const stockPercentage = action.stockSecurityId ? (action.cashPerShare ? action.stockBasisPercentage! : "1") : "0";
    const settlement = settleReorganization(oldPosition, baseCash, stockPercentage);
    const replacementQuantity = action.stockSecurityId && action.stockRatio
      ? multiplyQuantity(quantity, action.stockRatio)
      : null;
    const replacement = replacementQuantity && action.stockSecurityId
      ? await loadReplacement(client, row.position_account_id, action.stockSecurityId, row.base_currency)
      : null;
    const updatedReplacement = replacement && replacementQuantity
      ? addReorganizationPosition(replacement.position, replacementQuantity, settlement.transferredCost)
      : null;
    const eventId = this.nextId();
    const effectiveAt = `${action.effectiveDate}T00:00:00.000Z`;
    await insertEvent(client, eventId, environmentId, row.scope, row.position_account_id, action, effectiveAt, appliedAt, ruleset,
      { oldQuantity: row.quantity, cashProceeds: baseCash.toString(), transferredCost: settlement.transferredCost.toString(), fxReference: fx?.reference ?? null });
    if (!baseCash.isZero()) await postCash(client, eventId, environmentId, row, baseCash, action.id, appliedAt, this.nextId);
    await insertQuantity(client, this.nextId(), eventId, environmentId, row.scope, row.position_account_id,
      action.securityId, `-${quantity.toString()}`, effectiveAt, "MERGER_OUT", { actionId: action.id });
    if (replacementQuantity && action.stockSecurityId) {
      await insertQuantity(client, this.nextId(), eventId, environmentId, row.scope, row.position_account_id,
        action.stockSecurityId, replacementQuantity.toString(), effectiveAt, "MERGER_IN", { actionId: action.id, ratio: action.stockRatio! });
    }
    const oldUpdated = await client.query(
      `UPDATE position_cost_basis SET quantity=0,remaining_cost=0,realized_gain_loss=$3,
       version=version+1,updated_at=$4 WHERE position_account_id=$1 AND security_id=$2 AND version=$5`,
      [row.position_account_id, action.securityId, settlement.oldPosition.realizedGainLoss.toString(), appliedAt, row.version],
    );
    if (oldUpdated.rowCount !== 1) throw new Error("Merger source cost-basis version conflict");
    if (replacement && updatedReplacement && action.stockSecurityId) {
      await client.query(
        `INSERT INTO position_cost_basis (position_account_id,security_id,currency,quantity,remaining_cost,realized_gain_loss,version,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT (position_account_id,security_id) DO UPDATE SET
         quantity=$4,remaining_cost=$5,realized_gain_loss=$6,version=position_cost_basis.version+1,updated_at=$7`,
        [row.position_account_id, action.stockSecurityId, row.base_currency, updatedReplacement.quantity.toString(),
          updatedReplacement.remainingCost.toString(), updatedReplacement.realizedGainLoss.toString(), appliedAt],
      );
      await client.query(
        `INSERT INTO corporate_action_basis_transfers (id,financial_event_id,environment_id,scope,
         source_position_account_id,source_security_id,target_position_account_id,target_security_id,amount,currency,
         allocation_method,ruleset_version,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$5,$7,$8,$9,$10,$11,$12,$13)`,
        [this.nextId(), eventId, environmentId, row.scope, row.position_account_id, action.securityId,
          action.stockSecurityId, settlement.transferredCost.toString(), row.base_currency,
          action.cashPerShare ? "PROVIDER_MIXED_ALLOCATION" : "FULL_BASIS_TRANSFER", ruleset,
          { stockBasisPercentage: stockPercentage }, appliedAt],
      );
    }
    await client.query(
      `INSERT INTO corporate_action_applications (id,environment_id,scope,source_action_id,position_account_id,financial_event_id,applied_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [this.nextId(), environmentId, row.scope, action.id, row.position_account_id, eventId, appliedAt],
    );
    await this.#outbox.enqueueUsingClient(client, { environmentId, eventType: "MergerSettled",
      payload: { financialEventId: eventId, positionAccountId: row.position_account_id, actionId: action.id },
      destination: "DISCORD", availableAt: appliedAt, maxAttempts: 8,
      idempotencyKey: `merger:${action.id}:${row.position_account_id}` });
    return true;
  }
}

function validate(action: MergerAction, appliedAt: string, ruleset: string): void {
  if (!action.termsComplete || Number.isNaN(Date.parse(appliedAt)) || !ruleset.trim()) throw new Error("Complete merger terms, time, and ruleset are required");
  const hasCash = action.cashPerShare !== undefined;
  const hasStock = action.stockSecurityId !== undefined && action.stockRatio !== undefined;
  if (!hasCash && !hasStock || (action.stockSecurityId === undefined) !== (action.stockRatio === undefined)) throw new Error("Incomplete merger consideration");
  if (hasCash && hasStock && action.stockBasisPercentage === undefined) throw new Error("Mixed merger basis allocation is required");
}

function mergerTerms(action: MergerAction) { return { cashPerShare: action.cashPerShare?.toString() ?? null,
  cashCurrency: action.cashPerShare?.currency ?? null, stockSecurityId: action.stockSecurityId ?? null,
  stockRatio: action.stockRatio ?? null, stockBasisPercentage: action.stockBasisPercentage ?? null }; }

function convertCash(amount: Money, base: Currency, fx?: MergerFxEvidence): Money {
  if (amount.currency === base) return amount;
  if (!fx) throw new Error("Foreign merger cash requires FX evidence");
  return convertForeignTrade(amount, base, fx.basePerForeignRate, Rate.of("0"), "SELL").grossBaseAmount;
}

function multiplyQuantity(quantity: Quantity, ratio: string): Quantity {
  const zero = emptyPositionCostBasis("CAD");
  const temporary = addReorganizationPosition(zero, quantity, Money.zero("CAD"));
  return applySplit(temporary, ratio).position.quantity;
}

async function loadReplacement(client: PgClientLike, positionAccountId: string, securityId: string, currency: Currency) {
  const result = await client.query<BasisRow>(
    `SELECT currency,quantity::text,remaining_cost::text,realized_gain_loss::text,version::text
     FROM position_cost_basis WHERE position_account_id=$1 AND security_id=$2 FOR UPDATE`, [positionAccountId, securityId]);
  const row = result.rows[0];
  return { position: row ? { quantity: Quantity.of(row.quantity), remainingCost: Money.of(row.remaining_cost, row.currency),
    realizedGainLoss: Money.of(row.realized_gain_loss, row.currency) } : emptyPositionCostBasis(currency) };
}

async function insertEvent(client: PgClientLike, id: string, environmentId: EnvironmentId, scope: string, positionAccountId: string, action: MergerAction,
  effectiveAt: string, appliedAt: string, ruleset: string, metadata: object) {
  await client.query(`INSERT INTO financial_events (id,environment_id,scope,event_type,status,business_effective_at,created_at,posted_at,
    source_type,source_id,idempotency_key,correlation_id,economy_ruleset_version,market_data_reference,metadata)
    VALUES ($1,$2,$3,'MERGER','POSTED',$4,$5,$5,'CORPORATE_ACTION',$6,$7,$8,$9,$10,$11)`,
  [id, environmentId, scope, effectiveAt, appliedAt, action.id, `merger:${action.id}:${positionAccountId}`,
    id, ruleset, action.reference, metadata]);
}

async function postCash(client: PgClientLike, eventId: string, environmentId: EnvironmentId, row: PositionRow, amount: Money,
  actionId: string, at: string, nextId: () => string) {
  const proposed = nextId();
  const inserted = await client.query<{ id: string } & QueryResultRow>(`INSERT INTO ledger_accounts (id,environment_id,scope,kind,owner_id)
    VALUES ($1,$2,$3,'CORPORATE_ACTION_CLEARING',NULL) ON CONFLICT DO NOTHING RETURNING id`, [proposed, environmentId, row.scope]);
  let clearing = inserted.rows[0]?.id;
  if (!clearing) {
    const found = await client.query<{ id: string } & QueryResultRow>(`SELECT id FROM ledger_accounts WHERE environment_id=$1 AND scope=$2
      AND kind='CORPORATE_ACTION_CLEARING' AND owner_id IS NULL`, [environmentId, row.scope]);
    clearing = found.rows[0]?.id;
  }
  if (!clearing) throw new Error("Corporate-action clearing account unavailable");
  for (const [account, direction] of [[row.cash_account_id, "DEBIT"], [clearing, "CREDIT"]] as const) {
    await client.query(`INSERT INTO journal_entries (id,financial_event_id,ledger_account_id,environment_id,scope,direction,amount,currency,created_at,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [nextId(), eventId, account, environmentId, row.scope, direction,
      amount.toString(), amount.currency, at, { actionId }]);
  }
}

async function insertQuantity(client: PgClientLike, id: string, eventId: string, environmentId: EnvironmentId, scope: string,
  positionId: string, securityId: string, delta: string, effectiveAt: string, type: string, metadata: object) {
  await client.query(`INSERT INTO security_quantity_entries (id,financial_event_id,environment_id,scope,position_account_id,security_id,
    quantity_delta,effective_at,entry_type,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [id,eventId,environmentId,scope,positionId,securityId,delta,effectiveAt,type,metadata]);
}

async function cancelOrder(client: PgClientLike, order: OrderRow, actionId: string, at: string, id: string) {
  const table = order.side === "BUY" ? "cash_reservations" : "share_reservations";
  const released = await client.query(`UPDATE ${table} SET status='RELEASED',resolved_at=$2,version=version+1 WHERE order_id=$1 AND status='ACTIVE'`, [order.id,at]);
  if (released.rowCount !== 1) throw new Error("Active merger-affected reservation not found");
  await client.query("UPDATE orders SET status='CANCELLED',updated_at=$2,version=version+1 WHERE id=$1", [order.id,at]);
  await client.query(`INSERT INTO order_events (id,order_id,from_status,to_status,reason,effective_at,idempotency_key,metadata)
    VALUES ($1,$2,$3,'CANCELLED','CORPORATE_ACTION',$4,$5,$6)`, [id,order.id,order.status,at,`merger-cancel:${actionId}:${order.id}`,{actionId}]);
}
