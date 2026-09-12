import { Money, type Currency } from "@stockpile/core";
import type {
  EconomicScope,
  EnvironmentId,
  FinancialEvent,
  FinancialEventId,
  JournalDirection,
  JournalEntry,
  JournalEntryId,
  JsonObject,
  LedgerAccountId,
  LedgerStore,
  PostedFinancialEvent,
} from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";

interface EventRow extends QueryResultRow {
  id: string;
  environment_id: string;
  scope: EconomicScope;
  event_type: string;
  status: "POSTED";
  business_effective_at: Date;
  created_at: Date;
  posted_at: Date;
  source_type: string;
  source_id: string;
  idempotency_key: string;
  correlation_id: string;
  economy_ruleset_version: string;
  market_data_reference: string | null;
  initiating_discord_user_id: string | null;
  reverses_event_id: string | null;
  metadata: JsonObject;
}

interface EntryRow extends QueryResultRow {
  id: string;
  financial_event_id: string;
  ledger_account_id: string;
  direction: JournalDirection;
  amount: string;
  currency: Currency;
  created_at: Date;
  metadata: JsonObject;
}

export class PostgresLedgerStore implements LedgerStore {
  constructor(private readonly pool: PgPoolLike) {}

  async commit(event: FinancialEvent, entries: readonly JournalEntry[]): Promise<PostedFinancialEvent> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const posted = await this.commitUsingClient(client, event, entries);
      await client.query("COMMIT");
      return posted;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async commitUsingClient(
    client: PgClientLike,
    event: FinancialEvent,
    entries: readonly JournalEntry[],
  ): Promise<PostedFinancialEvent> {
    const inserted = await this.insertEvent(client, event);
    if (!inserted) {
      const existing = await this.findWithClient(
        client,
        event.environmentId,
        event.scope,
        event.idempotencyKey,
      );
      if (!existing) throw new Error("Idempotency conflict did not resolve to an existing event");
      return existing;
    }

    for (const entry of entries) await this.insertEntry(client, event, entry);
    return Object.freeze({ event, entries: Object.freeze([...entries]) });
  }

  async findByIdempotencyKey(
    environmentId: EnvironmentId,
    scope: EconomicScope,
    idempotencyKey: string,
  ): Promise<PostedFinancialEvent | null> {
    const client = await this.pool.connect();
    try {
      return await this.findWithClient(client, environmentId, scope, idempotencyKey);
    } finally {
      client.release();
    }
  }

  private async insertEvent(client: PgClientLike, event: FinancialEvent): Promise<boolean> {
    const result = await client.query(
      `INSERT INTO financial_events (
         id, environment_id, scope, event_type, status, business_effective_at, created_at, posted_at,
         source_type, source_id, idempotency_key, correlation_id, economy_ruleset_version,
         market_data_reference, initiating_discord_user_id, reverses_event_id, metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
       ) ON CONFLICT (environment_id, scope, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        event.id,
        event.environmentId,
        event.scope,
        event.eventType,
        event.status,
        event.businessEffectiveAt,
        event.createdAt,
        event.postedAt,
        event.sourceType,
        event.sourceId,
        event.idempotencyKey,
        event.correlationId,
        event.economyRulesetVersion,
        event.marketDataReference ?? null,
        event.initiatingDiscordUserId ?? null,
        event.reversesEventId ?? null,
        event.metadata ?? {},
      ],
    );
    return result.rowCount === 1;
  }

  private async insertEntry(client: PgClientLike, event: FinancialEvent, entry: JournalEntry): Promise<void> {
    await client.query(
      `INSERT INTO journal_entries (
         id, financial_event_id, ledger_account_id, environment_id, scope,
         direction, amount, currency, created_at, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id,
        entry.financialEventId,
        entry.ledgerAccountId,
        event.environmentId,
        event.scope,
        entry.direction,
        entry.amount.toString(),
        entry.amount.currency,
        entry.createdAt,
        entry.metadata ?? {},
      ],
    );
  }

  private async findWithClient(
    client: PgClientLike,
    environmentId: EnvironmentId,
    scope: EconomicScope,
    idempotencyKey: string,
  ): Promise<PostedFinancialEvent | null> {
    const eventResult = await client.query<EventRow>(
      `SELECT * FROM financial_events
       WHERE environment_id = $1 AND scope = $2 AND idempotency_key = $3`,
      [environmentId, scope, idempotencyKey],
    );
    const row = eventResult.rows[0];
    if (!row) return null;
    const entryResult = await client.query<EntryRow>(
      `SELECT id, financial_event_id, ledger_account_id, direction, amount, currency, created_at, metadata
       FROM journal_entries
       WHERE financial_event_id = $1
       ORDER BY id`,
      [row.id],
    );
    return freezePosted(mapEvent(row), entryResult.rows.map(mapEntry));
  }
}

function mapEvent(row: EventRow): FinancialEvent {
  return Object.freeze({
    id: row.id as FinancialEventId,
    environmentId: row.environment_id as EnvironmentId,
    scope: row.scope,
    eventType: row.event_type,
    status: row.status,
    businessEffectiveAt: row.business_effective_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    postedAt: row.posted_at.toISOString(),
    sourceType: row.source_type,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id as FinancialEvent["correlationId"],
    economyRulesetVersion: row.economy_ruleset_version,
    ...(row.market_data_reference === null ? {} : { marketDataReference: row.market_data_reference }),
    ...(row.initiating_discord_user_id === null
      ? {}
      : { initiatingDiscordUserId: row.initiating_discord_user_id }),
    ...(row.reverses_event_id === null
      ? {}
      : { reversesEventId: row.reverses_event_id as FinancialEventId }),
    metadata: deepFreeze(structuredClone(row.metadata)),
  });
}

function mapEntry(row: EntryRow): JournalEntry {
  return Object.freeze({
    id: row.id as JournalEntryId,
    financialEventId: row.financial_event_id as FinancialEventId,
    ledgerAccountId: row.ledger_account_id as LedgerAccountId,
    direction: row.direction,
    amount: Money.of(row.amount, row.currency),
    createdAt: row.created_at.toISOString(),
    metadata: deepFreeze(structuredClone(row.metadata)),
  });
}

function freezePosted(event: FinancialEvent, entries: readonly JournalEntry[]): PostedFinancialEvent {
  return Object.freeze({ event, entries: Object.freeze(entries) });
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}
