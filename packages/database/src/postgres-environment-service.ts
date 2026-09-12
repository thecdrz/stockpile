import type { Currency } from "@stockpile/core";
import type { EnvironmentId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

interface EnvironmentRow extends QueryResultRow { id: string; base_currency: Currency; }
export interface StockpileEnvironment { readonly id: EnvironmentId; readonly baseCurrency: Currency; readonly created: boolean; }

export class PostgresEnvironmentService {
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {}
  async ensure(discordGuildId: string, baseCurrency: Currency): Promise<StockpileEnvironment> {
    if (!discordGuildId.trim()) throw new Error("Discord guild ID is required");
    const proposedId = this.nextId();
    const inserted = await this.pool.query<EnvironmentRow>(
      `INSERT INTO environments (id,discord_guild_id,base_currency) VALUES ($1,$2,$3)
       ON CONFLICT (discord_guild_id) DO NOTHING RETURNING id,base_currency`,
      [proposedId,discordGuildId,baseCurrency],
    );
    const created = inserted.rows[0];
    if (created) return Object.freeze({id:created.id as EnvironmentId,baseCurrency:created.base_currency,created:true});
    const existing = await this.pool.query<EnvironmentRow>("SELECT id,base_currency FROM environments WHERE discord_guild_id=$1",[discordGuildId]);
    const row=existing.rows[0];
    if(!row)throw new Error("Environment identity conflict did not resolve");
    if(row.base_currency!==baseCurrency)throw new Error("Configured base currency differs from the existing environment");
    return Object.freeze({id:row.id as EnvironmentId,baseCurrency:row.base_currency,created:false});
  }
}
