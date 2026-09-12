import type { LedgerAccount, LedgerAccountCatalog, LedgerAccountKind } from "@stockpile/ledger";
import type { EconomicScope, EnvironmentId, LedgerAccountId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

interface AccountRow extends QueryResultRow {
  id: string;
  environment_id: string;
  scope: EconomicScope;
  kind: LedgerAccountKind;
  owner_id: string | null;
}

export class PostgresLedgerAccountCatalog implements LedgerAccountCatalog {
  constructor(private readonly pool: PgPoolLike) {}

  async get(accountId: LedgerAccountId): Promise<LedgerAccount | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT id, environment_id, scope, kind, owner_id
       FROM ledger_accounts
       WHERE id = $1`,
      [accountId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      id: row.id as LedgerAccountId,
      environmentId: row.environment_id as EnvironmentId,
      scope: row.scope,
      kind: row.kind,
      ...(row.owner_id === null ? {} : { ownerId: row.owner_id }),
    });
  }
}
