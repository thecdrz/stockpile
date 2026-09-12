import type { EnvironmentId } from "@stockpile/ledger";
import type { DelistingAction, MergerAction, SpinoffAction, SymbolChangeAction } from "@stockpile/market-data";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOutbox } from "./postgres-outbox.js";

type ReviewAction = MergerAction | SpinoffAction;
type LifecycleAction = SymbolChangeAction | DelistingAction | ReviewAction;

interface SecurityRow extends QueryResultRow { symbol: string; trading_status: string; }
interface OrderRow extends QueryResultRow { id: string; side: "BUY" | "SELL"; status: string; }

export interface SecurityLifecycleResult { readonly changed: boolean; readonly ordersCancelled: number; }

export class PostgresSecurityLifecycleService {
  readonly #outbox: PostgresOutbox;
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {
    this.#outbox = new PostgresOutbox(pool, nextId);
  }

  applySymbolChange(environmentId: EnvironmentId, action: SymbolChangeAction, appliedAt: string): Promise<SecurityLifecycleResult> {
    if (!action.newSymbol.trim()) throw new Error("New symbol is required");
    return this.apply(environmentId, action, appliedAt, "ACTIVE", action.newSymbol, "SYMBOL_CHANGED");
  }

  applyDelisting(environmentId: EnvironmentId, action: DelistingAction, appliedAt: string): Promise<SecurityLifecycleResult> {
    return this.apply(environmentId, action, appliedAt, "DELISTED", null, "DELISTED_WITHOUT_TERMINAL_VALUE");
  }

  placeInReview(environmentId: EnvironmentId, action: ReviewAction, appliedAt: string): Promise<SecurityLifecycleResult> {
    return this.apply(environmentId, action, appliedAt, "CORPORATE_ACTION_REVIEW", null, "INCOMPLETE_CORPORATE_ACTION_TERMS");
  }

  private async apply(
    environmentId: EnvironmentId,
    action: LifecycleAction,
    appliedAt: string,
    newStatus: "ACTIVE" | "DELISTED" | "CORPORATE_ACTION_REVIEW",
    newSymbol: string | null,
    reason: string,
  ): Promise<SecurityLifecycleResult> {
    if (Number.isNaN(Date.parse(appliedAt))) throw new Error("Invalid lifecycle action time");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await client.query(
        "SELECT 1 FROM security_status_events WHERE environment_id=$1 AND source_action_id=$2",
        [environmentId, action.id],
      );
      if (replay.rowCount === 1) {
        await client.query("COMMIT");
        return Object.freeze({ changed: false, ordersCancelled: 0 });
      }
      await persistAction(client, action, appliedAt);
      const securityResult = await client.query<SecurityRow>(
        "SELECT symbol, trading_status FROM securities WHERE id=$1 FOR UPDATE",
        [action.securityId],
      );
      const security = securityResult.rows[0];
      if (!security) throw new Error("Corporate-action security not found");
      const resolvedSymbol = newSymbol ?? security.symbol;
      if (newSymbol && newSymbol !== security.symbol) {
        await client.query(
          `INSERT INTO security_symbol_aliases (id,security_id,symbol,valid_through,created_at)
           VALUES ($1,$2,$3,$4::timestamptz::date,$4) ON CONFLICT (security_id,symbol) DO NOTHING`,
          [this.nextId(), action.securityId, security.symbol, appliedAt],
        );
      }
      const orders = await client.query<OrderRow>(
        `SELECT id,side,status FROM orders WHERE environment_id=$1 AND security_id=$2
         AND status IN ('PENDING_VERIFIED_PRICE','PENDING_MARKET_OPEN','OPEN') ORDER BY id FOR UPDATE`,
        [environmentId, action.securityId],
      );
      for (const order of orders.rows) await cancelOrder(client, order, action.id, appliedAt, this.nextId());
      await client.query(
        `UPDATE securities SET symbol=$2,trading_status=$3,
           eligible_for_trading=CASE WHEN $3='ACTIVE' THEN eligible_for_trading ELSE false END,
           last_supported_date=CASE WHEN $3='DELISTED' THEN $4::timestamptz::date ELSE last_supported_date END,
           updated_at=$4 WHERE id=$1`,
        [action.securityId, resolvedSymbol, newStatus, appliedAt],
      );
      await client.query(
        `INSERT INTO security_status_events (
           id,environment_id,security_id,source_action_id,prior_symbol,new_symbol,
           prior_status,new_status,reason,effective_at,created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [this.nextId(), environmentId, action.securityId, action.id, security.symbol, resolvedSymbol,
          security.trading_status, newStatus, reason, `${action.effectiveDate}T00:00:00.000Z`, appliedAt],
      );
      if (newStatus === "CORPORATE_ACTION_REVIEW") {
        await client.query(
          `INSERT INTO operational_alerts (
             id,environment_id,severity,alert_type,message,context,deduplication_key,status,created_at
           ) VALUES ($1,$2,'CRITICAL','CORPORATE_ACTION_REVIEW',$3,$4,$5,'OPEN',$6)
           ON CONFLICT (environment_id,deduplication_key) DO UPDATE SET
             message=EXCLUDED.message,context=EXCLUDED.context,status='OPEN',resolved_at=NULL`,
          [this.nextId(), environmentId, `Incomplete ${action.type} terms require review`,
            { actionId: action.id, securityId: action.securityId, reference: action.reference },
            `corporate-action-review:${action.id}`, appliedAt],
        );
      }
      await this.#outbox.enqueueUsingClient(client, {
        environmentId, eventType: "SecurityLifecycleChanged",
        payload: { securityId: action.securityId, actionId: action.id, reason, newSymbol: resolvedSymbol, newStatus },
        destination: "DISCORD", availableAt: appliedAt, maxAttempts: 8,
        idempotencyKey: `security-lifecycle:${action.id}`,
      });
      await client.query("COMMIT");
      return Object.freeze({ changed: true, ordersCancelled: orders.rows.length });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}

async function persistAction(client: PgClientLike, action: LifecycleAction, appliedAt: string): Promise<void> {
  await client.query(
    `INSERT INTO corporate_actions (source_action_id,security_id,action_type,effective_date,terms,market_data_reference,detected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (source_action_id) DO NOTHING`,
    [action.id, action.securityId, action.type, action.effectiveDate,
      action.type === "SYMBOL_CHANGE" ? { newSymbol: action.newSymbol } : { termsComplete: "termsComplete" in action ? action.termsComplete : null },
      action.reference, appliedAt],
  );
}

async function cancelOrder(client: PgClientLike, order: OrderRow, actionId: string, appliedAt: string, eventId: string): Promise<void> {
  const table = order.side === "BUY" ? "cash_reservations" : "share_reservations";
  const released = await client.query(
    `UPDATE ${table} SET status='RELEASED',resolved_at=$2,version=version+1 WHERE order_id=$1 AND status='ACTIVE'`,
    [order.id, appliedAt],
  );
  if (released.rowCount !== 1) throw new Error("Active lifecycle-affected reservation not found");
  await client.query("UPDATE orders SET status='CANCELLED',updated_at=$2,version=version+1 WHERE id=$1", [order.id, appliedAt]);
  await client.query(
    `INSERT INTO order_events (id,order_id,from_status,to_status,reason,effective_at,idempotency_key,metadata)
     VALUES ($1,$2,$3,'CANCELLED','CORPORATE_ACTION',$4,$5,$6)`,
    [eventId, order.id, order.status, appliedAt, `corporate-action-cancel:${actionId}:${order.id}`, { actionId }],
  );
}
