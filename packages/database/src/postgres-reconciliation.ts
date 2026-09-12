import type { EnvironmentId, JsonObject } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";

export type ReconciliationCheck =
  | "JOURNAL_BALANCE"
  | "POSITION_QUANTITY"
  | "CASH_RESERVATION"
  | "SHARE_RESERVATION";

export interface ReconciliationViolation {
  readonly check: ReconciliationCheck;
  readonly key: string;
  readonly message: string;
  readonly context: JsonObject;
}

export interface ReconciliationReport {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: "PASSED" | "FAILED";
  readonly violations: readonly ReconciliationViolation[];
}

interface JournalRow extends QueryResultRow {
  financial_event_id: string;
  currency: string;
  difference: string;
}

interface PositionRow extends QueryResultRow {
  position_account_id: string;
  security_id: string;
  ledger_quantity: string;
  projection_quantity: string | null;
}

interface CashReservationRow extends QueryResultRow {
  ledger_account_id: string;
  currency: string;
  cash_balance: string;
  reserved_amount: string;
}

interface ShareReservationRow extends QueryResultRow {
  position_account_id: string;
  security_id: string;
  owned_quantity: string;
  reserved_quantity: string;
}

export class PostgresReconciliationService {
  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
    private readonly now: () => string,
  ) {}

  async run(environmentId: EnvironmentId): Promise<ReconciliationReport> {
    const client = await this.pool.connect();
    const startedAt = this.now();
    const runId = this.nextId();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const violations = [
        ...(await this.checkJournal(client, environmentId)),
        ...(await this.checkPositions(client, environmentId)),
        ...(await this.checkCashReservations(client, environmentId)),
        ...(await this.checkShareReservations(client, environmentId)),
      ];
      const completedAt = this.now();
      const status = violations.length === 0 ? "PASSED" : "FAILED";
      await client.query(
        `INSERT INTO reconciliation_runs (
           id, environment_id, started_at, completed_at, status, violation_count, summary
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [runId, environmentId, startedAt, completedAt, status, violations.length, summarize(violations)],
      );
      for (const violation of violations) {
        await client.query(
          `INSERT INTO operational_alerts (
             id, environment_id, severity, alert_type, message, context,
             deduplication_key, status, created_at
           ) VALUES ($1, $2, 'CRITICAL', 'RECONCILIATION_FAILURE', $3, $4, $5, 'OPEN', $6)
           ON CONFLICT (environment_id, deduplication_key) DO UPDATE SET
             message = EXCLUDED.message, context = EXCLUDED.context, status = 'OPEN', resolved_at = NULL`,
          [
            this.nextId(),
            environmentId,
            violation.message,
            violation.context,
            `reconciliation:${violation.check}:${violation.key}`,
            completedAt,
          ],
        );
      }
      await client.query("COMMIT");
      return Object.freeze({
        id: runId,
        environmentId,
        startedAt,
        completedAt,
        status,
        violations: Object.freeze(violations),
      });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async checkJournal(client: PgClientLike, environmentId: EnvironmentId): Promise<ReconciliationViolation[]> {
    const result = await client.query<JournalRow>(
      `SELECT entry.financial_event_id, entry.currency,
              sum(CASE entry.direction WHEN 'DEBIT' THEN entry.amount ELSE -entry.amount END)::text AS difference
       FROM journal_entries entry
       JOIN financial_events event ON event.id = entry.financial_event_id
       WHERE event.environment_id = $1
       GROUP BY entry.financial_event_id, entry.currency
       HAVING sum(CASE entry.direction WHEN 'DEBIT' THEN entry.amount ELSE -entry.amount END) <> 0`,
      [environmentId],
    );
    return result.rows.map((row) =>
      freezeViolation({
        check: "JOURNAL_BALANCE",
        key: `${row.financial_event_id}:${row.currency}`,
        message: `Financial event ${row.financial_event_id} is unbalanced in ${row.currency}`,
        context: { financialEventId: row.financial_event_id, currency: row.currency, difference: row.difference },
      }),
    );
  }

  private async checkPositions(client: PgClientLike, environmentId: EnvironmentId): Promise<ReconciliationViolation[]> {
    const result = await client.query<PositionRow>(
      `WITH ledger AS (
         SELECT position_account_id, security_id, sum(quantity_delta) AS quantity
         FROM security_quantity_entries WHERE environment_id = $1
         GROUP BY position_account_id, security_id
       ), projections AS (
         SELECT projection.* FROM position_cost_basis projection
         JOIN position_accounts account ON account.id = projection.position_account_id
         WHERE account.environment_id = $1
       )
       SELECT COALESCE(ledger.position_account_id, projection.position_account_id) AS position_account_id,
              COALESCE(ledger.security_id, projection.security_id) AS security_id,
              COALESCE(ledger.quantity, 0)::text AS ledger_quantity,
              projection.quantity::text AS projection_quantity
       FROM ledger
       FULL OUTER JOIN projections projection
         ON projection.position_account_id = ledger.position_account_id
        AND projection.security_id = ledger.security_id
       WHERE projection.quantity IS NULL OR projection.quantity <> COALESCE(ledger.quantity, 0)`,
      [environmentId],
    );
    return result.rows.map((row) =>
      freezeViolation({
        check: "POSITION_QUANTITY",
        key: `${row.position_account_id}:${row.security_id}`,
        message: `Position projection differs from quantity ledger`,
        context: {
          positionAccountId: row.position_account_id,
          securityId: row.security_id,
          ledgerQuantity: row.ledger_quantity,
          projectionQuantity: row.projection_quantity,
        },
      }),
    );
  }

  private async checkCashReservations(
    client: PgClientLike,
    environmentId: EnvironmentId,
  ): Promise<ReconciliationViolation[]> {
    const result = await client.query<CashReservationRow>(
      `WITH balances AS (
         SELECT entry.ledger_account_id, entry.currency,
                sum(CASE entry.direction WHEN 'DEBIT' THEN entry.amount ELSE -entry.amount END) AS amount
         FROM journal_entries entry
         JOIN ledger_accounts account ON account.id = entry.ledger_account_id
         WHERE account.environment_id = $1
         GROUP BY entry.ledger_account_id, entry.currency
       ), reservations AS (
         SELECT ledger_account_id, currency, sum(amount) AS amount
         FROM cash_reservations WHERE environment_id = $1 AND status = 'ACTIVE'
         GROUP BY ledger_account_id, currency
       )
       SELECT reservations.ledger_account_id, reservations.currency,
              COALESCE(balances.amount, 0)::text AS cash_balance,
              reservations.amount::text AS reserved_amount
       FROM reservations LEFT JOIN balances USING (ledger_account_id, currency)
       WHERE reservations.amount > COALESCE(balances.amount, 0)`,
      [environmentId],
    );
    return result.rows.map((row) =>
      freezeViolation({
        check: "CASH_RESERVATION",
        key: `${row.ledger_account_id}:${row.currency}`,
        message: `Active cash reservations exceed cash balance`,
        context: {
          ledgerAccountId: row.ledger_account_id,
          currency: row.currency,
          cashBalance: row.cash_balance,
          reservedAmount: row.reserved_amount,
        },
      }),
    );
  }

  private async checkShareReservations(
    client: PgClientLike,
    environmentId: EnvironmentId,
  ): Promise<ReconciliationViolation[]> {
    const result = await client.query<ShareReservationRow>(
      `WITH owned AS (
         SELECT position_account_id, security_id, sum(quantity_delta) AS quantity
         FROM security_quantity_entries WHERE environment_id = $1
         GROUP BY position_account_id, security_id
       ), reserved AS (
         SELECT position_account_id, security_id, sum(quantity) AS quantity
         FROM share_reservations WHERE environment_id = $1 AND status = 'ACTIVE'
         GROUP BY position_account_id, security_id
       )
       SELECT reserved.position_account_id, reserved.security_id,
              COALESCE(owned.quantity, 0)::text AS owned_quantity,
              reserved.quantity::text AS reserved_quantity
       FROM reserved LEFT JOIN owned USING (position_account_id, security_id)
       WHERE reserved.quantity > COALESCE(owned.quantity, 0)`,
      [environmentId],
    );
    return result.rows.map((row) =>
      freezeViolation({
        check: "SHARE_RESERVATION",
        key: `${row.position_account_id}:${row.security_id}`,
        message: `Active share reservations exceed owned quantity`,
        context: {
          positionAccountId: row.position_account_id,
          securityId: row.security_id,
          ownedQuantity: row.owned_quantity,
          reservedQuantity: row.reserved_quantity,
        },
      }),
    );
  }
}

function summarize(violations: readonly ReconciliationViolation[]): JsonObject {
  const counts: Record<string, number> = {};
  for (const violation of violations) counts[violation.check] = (counts[violation.check] ?? 0) + 1;
  return Object.freeze({ violationCount: violations.length, counts });
}

function freezeViolation(violation: ReconciliationViolation): ReconciliationViolation {
  return Object.freeze({ ...violation, context: Object.freeze({ ...violation.context }) });
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
