import { Money } from "@stockpile/core";
import type {
  CorrelationId,
  EnvironmentId,
  FinancialEvent,
  FinancialEventId,
  JournalEntry,
  JournalEntryId,
  LedgerAccountId,
  PostedFinancialEvent,
} from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresLedgerStore } from "./postgres-ledger-store.js";

interface IdRow extends QueryResultRow {
  id: string;
}

export interface OpenCareerAccountCommand {
  readonly environmentId: EnvironmentId;
  readonly playerId: string;
  readonly businessEffectiveAt: string;
  readonly correlationId: CorrelationId;
  readonly economyRulesetVersion: string;
}

export interface OpenedCareerAccount {
  readonly playerCashAccountId: LedgerAccountId;
  readonly systemEquityAccountId: LedgerAccountId;
  readonly positionAccountId: string;
  readonly openingGrant: PostedFinancialEvent;
}

export interface CareerAccountServiceDependencies {
  readonly pool: PgPoolLike;
  readonly now: () => string;
  readonly nextId: () => string;
}

export class PostgresCareerAccountService {
  readonly #ledgerStore: PostgresLedgerStore;

  constructor(private readonly dependencies: CareerAccountServiceDependencies) {
    this.#ledgerStore = new PostgresLedgerStore(dependencies.pool);
  }

  async open(command: OpenCareerAccountCommand): Promise<OpenedCareerAccount> {
    const client = await this.dependencies.pool.connect();
    try {
      await client.query("BEGIN");
      const opened = await this.openUsingClient(client, command);
      await client.query("COMMIT");
      return opened;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async openUsingClient(client: PgClientLike, command: OpenCareerAccountCommand): Promise<OpenedCareerAccount> {
    if (command.playerId.trim().length === 0) throw new Error("Player ID is required");
    if (Number.isNaN(Date.parse(command.businessEffectiveAt))) throw new Error("Invalid business effective time");
    const playerCashAccountId = await this.ensureAccount(
        client,
        command.environmentId,
        "CAREER",
        "PLAYER_CASH",
        command.playerId,
    );
    const systemEquityAccountId = await this.ensureAccount(
        client,
        command.environmentId,
        "CAREER",
        "SYSTEM_EQUITY",
        null,
    );
    const positionAccountId = await this.ensurePositionAccount(client, command.environmentId, command.playerId);
    const timestamp = this.dependencies.now();
    const eventId = this.dependencies.nextId() as FinancialEventId;
    const event: FinancialEvent = Object.freeze({
        id: eventId,
        environmentId: command.environmentId,
        scope: "CAREER",
        eventType: "ACCOUNT_OPENING_GRANT",
        status: "POSTED",
        businessEffectiveAt: command.businessEffectiveAt,
        createdAt: timestamp,
        postedAt: timestamp,
        sourceType: "SYSTEM",
        sourceId: `career-account:${command.playerId}`,
        idempotencyKey: `account-opening:${command.playerId}:career`,
        correlationId: command.correlationId,
        economyRulesetVersion: command.economyRulesetVersion,
        metadata: Object.freeze({ playerId: command.playerId }),
    });
    const amount = Money.of("100000", "CAD");
    const entries: readonly JournalEntry[] = Object.freeze([
        Object.freeze({
          id: this.dependencies.nextId() as JournalEntryId,
          financialEventId: eventId,
          ledgerAccountId: playerCashAccountId,
          direction: "DEBIT",
          amount,
          createdAt: timestamp,
        }),
        Object.freeze({
          id: this.dependencies.nextId() as JournalEntryId,
          financialEventId: eventId,
          ledgerAccountId: systemEquityAccountId,
          direction: "CREDIT",
          amount,
          createdAt: timestamp,
        }),
    ]);
    const openingGrant = await this.#ledgerStore.commitUsingClient(client, event, entries);
    return Object.freeze({ playerCashAccountId, systemEquityAccountId, positionAccountId, openingGrant });
  }

  private async ensureAccount(
    client: PgClientLike,
    environmentId: EnvironmentId,
    scope: "CAREER",
    kind: "PLAYER_CASH" | "SYSTEM_EQUITY",
    ownerId: string | null,
  ): Promise<LedgerAccountId> {
    const proposedId = this.dependencies.nextId();
    const inserted = await client.query<IdRow>(
      `INSERT INTO ledger_accounts (id, environment_id, scope, kind, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [proposedId, environmentId, scope, kind, ownerId],
    );
    const insertedId = inserted.rows[0]?.id;
    if (insertedId) return insertedId as LedgerAccountId;

    const existing = await client.query<IdRow>(
      `SELECT id FROM ledger_accounts
       WHERE environment_id = $1 AND scope = $2 AND kind = $3
         AND owner_id IS NOT DISTINCT FROM $4`,
      [environmentId, scope, kind, ownerId],
    );
    const existingId = existing.rows[0]?.id;
    if (!existingId) throw new Error(`Could not resolve ledger account ${kind}`);
    return existingId as LedgerAccountId;
  }

  private async ensurePositionAccount(
    client: PgClientLike,
    environmentId: EnvironmentId,
    ownerId: string,
  ): Promise<string> {
    const proposedId = this.dependencies.nextId();
    const inserted = await client.query<IdRow>(
      `INSERT INTO position_accounts (id, environment_id, scope, owner_id, league_period)
       VALUES ($1, $2, 'CAREER', $3, NULL)
       ON CONFLICT DO NOTHING RETURNING id`,
      [proposedId, environmentId, ownerId],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;
    const existing = await client.query<IdRow>(
      `SELECT id FROM position_accounts
       WHERE environment_id = $1 AND scope = 'CAREER' AND owner_id = $2 AND league_period IS NULL`,
      [environmentId, ownerId],
    );
    if (!existing.rows[0]) throw new Error("Could not resolve Career position account");
    return existing.rows[0].id;
  }
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
