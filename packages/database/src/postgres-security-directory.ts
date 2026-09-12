import type { Currency } from "@stockpile/core";
import type { SecurityId } from "@stockpile/market-data";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";

export type SecurityTradingStatus = "ACTIVE" | "HALTED" | "CORPORATE_ACTION_REVIEW" | "DELISTED";

export interface SynchronizeSecurityCommand {
  readonly securityId: SecurityId;
  readonly symbol: string;
  readonly name: string;
  readonly exchange: "SYNTHETIC_US" | "SYNTHETIC_CA";
  readonly mic?: string;
  readonly currency: Currency;
  readonly countryCode: "CA" | "US";
  readonly kind: "STOCK" | "ETF";
  readonly isin?: string;
  readonly figi?: string;
  readonly provider: string;
  readonly providerSecurityId: string;
  readonly firstSupportedDate?: string;
  readonly lastSupportedDate?: string;
  readonly eligibleForTrading: boolean;
  readonly observedAt: string;
}

export interface SynchronizedSecurity {
  readonly securityId: SecurityId;
  readonly created: boolean;
  readonly symbolChanged: boolean;
}

interface ExistingSecurityRow extends QueryResultRow {
  id: string;
  symbol: string;
}

export class PostgresSecurityDirectory {
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {}

  async synchronize(command: SynchronizeSecurityCommand): Promise<SynchronizedSecurity> {
    validate(command);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query<ExistingSecurityRow>(
        "SELECT id, symbol FROM securities WHERE id = $1 FOR UPDATE",
        [command.securityId],
      );
      const existing = existingResult.rows[0];
      const created = existing === undefined;
      const symbolChanged = existing !== undefined && existing.symbol !== command.symbol;
      if (created) {
        await client.query(
          `INSERT INTO securities (
             id, symbol, name, exchange, mic, listing_currency, country_code, kind, is_synthetic,
             trading_status, eligible_for_trading, isin, figi, first_supported_date,
             last_supported_date, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'ACTIVE',$9,$10,$11,$12,$13,$14)`,
          values(command),
        );
      } else {
        if (symbolChanged) {
          await client.query(
            `INSERT INTO security_symbol_aliases (id, security_id, symbol, valid_through, created_at)
             VALUES ($1,$2,$3,$4::timestamptz::date,$4)
             ON CONFLICT (security_id, symbol) DO NOTHING`,
            [this.nextId(), command.securityId, existing.symbol, command.observedAt],
          );
        }
        await client.query(
          `UPDATE securities SET symbol=$2, name=$3, exchange=$4, mic=$5, listing_currency=$6,
             country_code=$7, kind=$8, eligible_for_trading=$9, isin=$10, figi=$11,
             first_supported_date=COALESCE(first_supported_date,$12), last_supported_date=$13,
             updated_at=$14 WHERE id=$1`,
          values(command),
        );
      }
      await client.query(
        `INSERT INTO security_provider_identifiers (
           id, security_id, provider, provider_security_id, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$5)
         ON CONFLICT (security_id, provider) DO UPDATE SET
           provider_security_id=EXCLUDED.provider_security_id, updated_at=EXCLUDED.updated_at`,
        [this.nextId(), command.securityId, command.provider, command.providerSecurityId, command.observedAt],
      );
      await client.query("COMMIT");
      return Object.freeze({ securityId: command.securityId, created, symbolChanged });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }

  async setTradingStatus(securityId: SecurityId, status: SecurityTradingStatus, effectiveAt: string): Promise<void> {
    if (Number.isNaN(Date.parse(effectiveAt))) throw new Error("Invalid security status time");
    const result = await this.pool.query(
      `UPDATE securities SET trading_status=$2,
         eligible_for_trading=CASE WHEN $2='ACTIVE' THEN eligible_for_trading ELSE false END,
         last_supported_date=CASE WHEN $2='DELISTED' THEN $3::timestamptz::date ELSE last_supported_date END,
         updated_at=$3 WHERE id=$1`,
      [securityId, status, effectiveAt],
    );
    if (result.rowCount !== 1) throw new Error("Security not found");
  }
}

function values(command: SynchronizeSecurityCommand): readonly unknown[] {
  return [command.securityId, command.symbol, command.name, command.exchange, command.mic ?? null,
    command.currency, command.countryCode, command.kind, command.eligibleForTrading, command.isin ?? null,
    command.figi ?? null, command.firstSupportedDate ?? null, command.lastSupportedDate ?? null, command.observedAt];
}

function validate(command: SynchronizeSecurityCommand): void {
  for (const value of [command.symbol, command.name, command.provider, command.providerSecurityId]) {
    if (!value.trim()) throw new Error("Security identity fields are required");
  }
  if (Number.isNaN(Date.parse(command.observedAt))) throw new Error("Invalid security observation time");
  for (const date of [command.firstSupportedDate, command.lastSupportedDate]) {
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid supported date");
  }
}
