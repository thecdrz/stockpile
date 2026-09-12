import { Money, Quantity, type Currency } from "@stockpile/core";
import type { EnvironmentId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

export interface NetWorthSnapshotPosition {
  readonly securityId: string;
  readonly quantity: Quantity;
  readonly marketValue: Money;
  readonly marketDataReference: string;
  readonly fxReference?: string;
}

export interface SaveNetWorthSnapshotCommand {
  readonly environmentId: EnvironmentId;
  readonly playerId: string;
  readonly scope: "CAREER" | "LEAGUE";
  readonly effectiveAt: string;
  readonly cash: Money;
  readonly positions: readonly NetWorthSnapshotPosition[];
  readonly prestigeLiquidationValue: Money;
  readonly collectibleLoanReceivables: Money;
  readonly totalDebt: Money;
  readonly accruedInterest: Money;
  readonly valuationRulesetVersion: string;
  readonly sourceKey: string;
  readonly createdAt: string;
}

export interface SavedNetWorthSnapshot {
  readonly id: string;
  readonly created: boolean;
  readonly netWorth: Money;
}

export class PostgresNetWorthSnapshotStore {
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {}

  async save(command: SaveNetWorthSnapshotCommand): Promise<SavedNetWorthSnapshot> {
    validate(command);
    const securityValue = sum(command.positions.map((position) => position.marketValue), command.cash.currency);
    const netWorth = command.cash.add(securityValue)
      .add(command.prestigeLiquidationValue).add(command.collectibleLoanReceivables)
      .subtract(command.totalDebt).subtract(command.accruedInterest);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const proposedId = this.nextId();
      const inserted = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO net_worth_snapshots (
           id, environment_id, player_id, scope, effective_at, cash_amount, security_market_value,
           prestige_liquidation_value, collectible_loan_receivables, total_debt, accrued_interest,
           net_worth, currency, valuation_ruleset_version, source_key, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (environment_id, player_id, scope, source_key) DO NOTHING RETURNING id`,
        [proposedId, command.environmentId, command.playerId, command.scope, command.effectiveAt,
          command.cash.toString(), securityValue.toString(), command.prestigeLiquidationValue.toString(),
          command.collectibleLoanReceivables.toString(), command.totalDebt.toString(), command.accruedInterest.toString(),
          netWorth.toString(), command.cash.currency, command.valuationRulesetVersion, command.sourceKey, command.createdAt],
      );
      const snapshotId = inserted.rows[0]?.id;
      if (!snapshotId) {
        const existing = await client.query<{ id: string; net_worth: string; currency: Currency } & QueryResultRow>(
          `SELECT id, net_worth::text, currency FROM net_worth_snapshots
           WHERE environment_id = $1 AND player_id = $2 AND scope = $3 AND source_key = $4`,
          [command.environmentId, command.playerId, command.scope, command.sourceKey],
        );
        const row = existing.rows[0];
        if (!row) throw new Error("Snapshot idempotency conflict did not resolve");
        await client.query("COMMIT");
        return Object.freeze({ id: row.id, created: false, netWorth: Money.of(row.net_worth, row.currency) });
      }
      for (const position of command.positions) {
        await client.query(
          `INSERT INTO net_worth_snapshot_positions (
             snapshot_id, security_id, quantity, market_value, market_data_reference, fx_reference
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [snapshotId, position.securityId, position.quantity.toString(), position.marketValue.toString(),
            position.marketDataReference, position.fxReference ?? null],
        );
      }
      await client.query("COMMIT");
      return Object.freeze({ id: snapshotId, created: true, netWorth });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}

function validate(command: SaveNetWorthSnapshotCommand): void {
  if (Number.isNaN(Date.parse(command.effectiveAt)) || Number.isNaN(Date.parse(command.createdAt))) throw new Error("Invalid snapshot time");
  if (!command.sourceKey.trim() || !command.valuationRulesetVersion.trim()) throw new Error("Snapshot source and ruleset are required");
  const amounts = [command.prestigeLiquidationValue, command.collectibleLoanReceivables, command.totalDebt, command.accruedInterest];
  for (const amount of amounts) if (amount.currency !== command.cash.currency) throw new Error("Snapshot currency mismatch");
  for (const position of command.positions) {
    if (position.marketValue.currency !== command.cash.currency) throw new Error("Snapshot position currency mismatch");
    if (!position.marketDataReference.trim()) throw new Error("Snapshot market evidence is required");
  }
}

function sum(amounts: readonly Money[], currency: Currency): Money {
  return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency));
}
