import { Money, Quantity } from "@stockpile/core";
import { applySplit, type EnvironmentId, type FinancialEventId } from "@stockpile/ledger";
import type { SplitAction } from "@stockpile/market-data";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOutbox } from "./postgres-outbox.js";

interface PositionRow extends QueryResultRow {
  position_account_id: string;
  scope: "CAREER" | "LEAGUE";
  currency: "CAD" | "USD";
  quantity: string;
  remaining_cost: string;
  realized_gain_loss: string;
  version: string;
}

interface OrderRow extends QueryResultRow {
  id: string;
  side: "BUY" | "SELL";
  status: string;
}

export interface ApplySplitCommand {
  readonly environmentId: EnvironmentId;
  readonly action: SplitAction;
  readonly appliedAt: string;
  readonly economyRulesetVersion: string;
}

export interface ApplySplitResult {
  readonly positionsChanged: number;
  readonly ordersCancelled: number;
}

export class PostgresSplitService {
  readonly #outbox: PostgresOutbox;
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {
    this.#outbox = new PostgresOutbox(pool, nextId);
  }

  async apply(command: ApplySplitCommand): Promise<ApplySplitResult> {
    validate(command);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO corporate_actions (
           source_action_id, security_id, action_type, effective_date, terms,
           market_data_reference, detected_at
         ) VALUES ($1, $2, 'SPLIT', $3, $4, $5, $6)
         ON CONFLICT (source_action_id) DO NOTHING`,
        [command.action.id, command.action.securityId, command.action.effectiveDate,
          { ratio: command.action.ratio }, command.action.reference, command.appliedAt],
      );

      const orders = await client.query<OrderRow>(
        `SELECT id, side, status FROM orders
         WHERE environment_id = $1 AND security_id = $2
           AND status IN ('PENDING_VERIFIED_PRICE', 'PENDING_MARKET_OPEN', 'OPEN')
         ORDER BY id FOR UPDATE`,
        [command.environmentId, command.action.securityId],
      );
      for (const order of orders.rows) await cancelOrder(client, order, command, this.nextId());

      const positions = await client.query<PositionRow>(
        `SELECT basis.position_account_id, account.scope, basis.currency, basis.quantity::text,
                basis.remaining_cost::text, basis.realized_gain_loss::text, basis.version::text
         FROM position_cost_basis basis
         JOIN position_accounts account ON account.id = basis.position_account_id
         WHERE account.environment_id = $1 AND basis.security_id = $2 AND basis.quantity > 0
         ORDER BY basis.position_account_id FOR UPDATE OF basis`,
        [command.environmentId, command.action.securityId],
      );
      let positionsChanged = 0;
      for (const row of positions.rows) {
        const applied = await this.applyPosition(client, row, command);
        if (applied) positionsChanged += 1;
      }
      await client.query("COMMIT");
      return Object.freeze({ positionsChanged, ordersCancelled: orders.rows.length });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async applyPosition(client: PgClientLike, row: PositionRow, command: ApplySplitCommand): Promise<boolean> {
    const existing = await client.query(
      `SELECT 1 FROM corporate_action_applications
       WHERE environment_id = $1 AND scope = $2 AND source_action_id = $3 AND position_account_id = $4`,
      [command.environmentId, row.scope, command.action.id, row.position_account_id],
    );
    if (existing.rowCount === 1) return false;
    const split = applySplit({
      quantity: Quantity.of(row.quantity),
      remainingCost: Money.of(row.remaining_cost, row.currency),
      realizedGainLoss: Money.of(row.realized_gain_loss, row.currency),
    }, command.action.ratio);
    if (split.quantityDelta.isZero()) return false;

    const eventId = this.nextId() as FinancialEventId;
    const effectiveAt = `${command.action.effectiveDate}T00:00:00.000Z`;
    await client.query(
      `INSERT INTO financial_events (
         id, environment_id, scope, event_type, status, business_effective_at, created_at, posted_at,
         source_type, source_id, idempotency_key, correlation_id, economy_ruleset_version,
         market_data_reference, metadata
       ) VALUES ($1, $2, $3, 'SPLIT', 'POSTED', $4, $5, $5, 'CORPORATE_ACTION', $6, $7, $8, $9, $10, $11)`,
      [eventId, command.environmentId, row.scope, effectiveAt, command.appliedAt, command.action.id,
        `split:${command.action.id}:${row.position_account_id}`, this.nextId(), command.economyRulesetVersion,
        command.action.reference, { ratio: command.action.ratio, priorQuantity: row.quantity }],
    );
    await client.query(
      `INSERT INTO security_quantity_entries (
         id, financial_event_id, environment_id, scope, position_account_id, security_id,
         quantity_delta, effective_at, entry_type, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SPLIT', $9)`,
      [this.nextId(), eventId, command.environmentId, row.scope, row.position_account_id,
        command.action.securityId, split.quantityDelta.toString(), effectiveAt, { ratio: command.action.ratio }],
    );
    const updated = await client.query(
      `UPDATE position_cost_basis SET quantity = $3, version = version + 1, updated_at = $4
       WHERE position_account_id = $1 AND security_id = $2 AND version = $5`,
      [row.position_account_id, command.action.securityId, split.position.quantity.toString(), command.appliedAt, row.version],
    );
    if (updated.rowCount !== 1) throw new Error("Split cost-basis version conflict");
    await client.query(
      `INSERT INTO corporate_action_applications (
         id, environment_id, scope, source_action_id, position_account_id, financial_event_id, applied_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [this.nextId(), command.environmentId, row.scope, command.action.id, row.position_account_id, eventId, command.appliedAt],
    );
    await this.#outbox.enqueueUsingClient(client, {
      environmentId: command.environmentId,
      eventType: "SplitApplied",
      payload: {
        financialEventId: eventId,
        positionAccountId: row.position_account_id,
        securityId: command.action.securityId,
        ratio: command.action.ratio,
      },
      destination: "DISCORD",
      availableAt: command.appliedAt,
      maxAttempts: 8,
      idempotencyKey: `split:${command.action.id}:${row.position_account_id}`,
    });
    return true;
  }
}

async function cancelOrder(client: PgClientLike, order: OrderRow, command: ApplySplitCommand, eventId: string): Promise<void> {
  const reservationTable = order.side === "BUY" ? "cash_reservations" : "share_reservations";
  const released = await client.query(
    `UPDATE ${reservationTable} SET status = 'RELEASED', resolved_at = $2, version = version + 1
     WHERE order_id = $1 AND status = 'ACTIVE'`,
    [order.id, command.appliedAt],
  );
  if (released.rowCount !== 1) throw new Error("Active split-affected order reservation not found");
  await client.query("UPDATE orders SET status = 'CANCELLED', updated_at = $2, version = version + 1 WHERE id = $1", [order.id, command.appliedAt]);
  await client.query(
    `INSERT INTO order_events (id, order_id, from_status, to_status, reason, effective_at, idempotency_key, metadata)
     VALUES ($1, $2, $3, 'CANCELLED', 'CORPORATE_ACTION', $4, $5, $6)`,
    [eventId, order.id, order.status, command.appliedAt, `split-cancel:${command.action.id}:${order.id}`, { actionId: command.action.id }],
  );
}

function validate(command: ApplySplitCommand): void {
  if (Number.isNaN(Date.parse(command.appliedAt))) throw new Error("Invalid split application time");
  if (command.economyRulesetVersion.trim().length === 0) throw new Error("Economy ruleset version is required");
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
}
