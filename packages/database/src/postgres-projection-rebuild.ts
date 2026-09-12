import { Money, Quantity, QuantityDelta, type Currency } from "@stockpile/core";
import { addReorganizationPosition, applyBuy, applySell, applySplit, emptyPositionCostBasis, type PositionCostBasis } from "@stockpile/ledger";
import type { EnvironmentId, JsonObject } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

export interface CostBasisHistoryRow {
  readonly positionAccountId: string;
  readonly securityId: string;
  readonly baseCurrency: Currency;
  readonly entryType: "TRADE_BUY" | "TRADE_SELL" | "SPLIT";
  readonly financialEventId?: string;
  readonly quantityDelta: string;
  readonly buyCost: string | null;
  readonly sellProceeds: string | null;
  readonly metadata: JsonObject;
  readonly eventMetadata?: JsonObject;
}

export interface BasisTransferHistoryRow {
  readonly financialEventId: string;
  readonly sourcePositionAccountId: string;
  readonly sourceSecurityId: string;
  readonly targetPositionAccountId: string;
  readonly targetSecurityId: string;
  readonly amount: string;
  readonly currency: Currency;
}

export interface RebuiltCostBasis {
  readonly positionAccountId: string;
  readonly securityId: string;
  readonly position: PositionCostBasis;
}

interface HistoryDbRow extends QueryResultRow {
  financial_event_id: string; position_account_id: string; security_id: string; base_currency: Currency; entry_type: string;
  quantity_delta: string; buy_cost: string | null; sell_proceeds: string | null; metadata: JsonObject; event_metadata: JsonObject;
}
interface TransferDbRow extends QueryResultRow { financial_event_id: string; source_position_account_id: string; source_security_id: string;
  target_position_account_id: string; target_security_id: string; amount: string; currency: Currency; }

export type ProjectionRebuildMode = "CHECK" | "REPAIR";

export interface ProjectionRebuildResult {
  readonly positionsChecked: number;
  readonly mismatches: number;
  readonly repaired: number;
}

export class PostgresProjectionRebuildService {
  constructor(private readonly pool: PgPoolLike) {}

  async rebuild(environmentId: EnvironmentId, mode: ProjectionRebuildMode, rebuiltAt: string): Promise<ProjectionRebuildResult> {
    if (Number.isNaN(Date.parse(rebuiltAt))) throw new Error("Invalid projection rebuild time");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const history = await client.query<HistoryDbRow>(
        `SELECT entry.financial_event_id, entry.position_account_id, entry.security_id, environment.base_currency,
                entry.entry_type, entry.quantity_delta::text,
                entry.unit_cost_amount::text AS buy_cost,
                execution.base_notional::text AS sell_proceeds, entry.metadata, event.metadata AS event_metadata
         FROM security_quantity_entries entry
         JOIN position_accounts account ON account.id = entry.position_account_id
         JOIN environments environment ON environment.id = entry.environment_id
         JOIN financial_events event ON event.id = entry.financial_event_id
         LEFT JOIN trade_executions execution ON execution.financial_event_id = entry.financial_event_id
         WHERE entry.environment_id = $1
         ORDER BY entry.effective_at, entry.financial_event_id,
           CASE entry.entry_type WHEN 'MERGER_OUT' THEN 1 WHEN 'SPINOFF_IN' THEN 2 WHEN 'MERGER_IN' THEN 3 ELSE 0 END,
           entry.id`,
        [environmentId],
      );
      const transferResult = await client.query<TransferDbRow>(
        `SELECT financial_event_id,source_position_account_id,source_security_id,
          target_position_account_id,target_security_id,amount::text,currency
         FROM corporate_action_basis_transfers WHERE environment_id=$1`, [environmentId]);
      const rebuilt = rebuildCostBasis(history.rows.map(mapRow), transferResult.rows.map(mapTransfer));
      let mismatches = 0;
      let repaired = 0;
      for (const item of rebuilt) {
        const current = await client.query<{ quantity: string; remaining_cost: string; realized_gain_loss: string } & QueryResultRow>(
          `SELECT quantity::text, remaining_cost::text, realized_gain_loss::text
           FROM position_cost_basis WHERE position_account_id=$1 AND security_id=$2 FOR UPDATE`,
          [item.positionAccountId, item.securityId],
        );
        const row = current.rows[0];
        const mismatch = !row || Quantity.of(row.quantity).toString() !== item.position.quantity.toString() ||
          Money.of(row.remaining_cost, item.position.remainingCost.currency).toString() !== item.position.remainingCost.toString() ||
          Money.of(row.realized_gain_loss, item.position.realizedGainLoss.currency).toString() !== item.position.realizedGainLoss.toString();
        if (!mismatch) continue;
        mismatches += 1;
        if (mode === "REPAIR") {
          await client.query(
            `INSERT INTO position_cost_basis (position_account_id,security_id,currency,quantity,remaining_cost,realized_gain_loss,version,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,1,$7)
             ON CONFLICT (position_account_id,security_id) DO UPDATE SET currency=EXCLUDED.currency,
               quantity=EXCLUDED.quantity, remaining_cost=EXCLUDED.remaining_cost,
               realized_gain_loss=EXCLUDED.realized_gain_loss, version=position_cost_basis.version+1, updated_at=EXCLUDED.updated_at`,
            [item.positionAccountId, item.securityId, item.position.remainingCost.currency, item.position.quantity.toString(),
              item.position.remainingCost.toString(), item.position.realizedGainLoss.toString(), rebuiltAt],
          );
          repaired += 1;
        }
      }
      await client.query(mode === "CHECK" ? "ROLLBACK" : "COMMIT");
      return Object.freeze({ positionsChecked: rebuilt.length, mismatches, repaired });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}

export function rebuildCostBasis(rows: readonly CostBasisHistoryRow[], transfers: readonly BasisTransferHistoryRow[] = []): readonly RebuiltCostBasis[] {
  const positions = new Map<string, RebuiltCostBasis>();
  const transferByEvent = new Map(transfers.map((transfer) => [transfer.financialEventId, transfer]));
  for (const row of rows) {
    const key = `${row.positionAccountId}\0${row.securityId}`;
    const current = positions.get(key)?.position ?? emptyPositionCostBasis(row.baseCurrency);
    let position: PositionCostBasis;
    if (row.entryType === "TRADE_BUY") {
      if (row.buyCost === null) throw new Error("Buy history is missing base cost");
      position = applyBuy(current, Quantity.of(row.quantityDelta), Money.of(row.buyCost, row.baseCurrency));
    } else if (row.entryType === "TRADE_SELL") {
      if (row.sellProceeds === null) throw new Error("Sell history is missing base proceeds");
      const sold = Quantity.of(QuantityDelta.of(row.quantityDelta).negate().toString());
      position = applySell(current, sold, Money.of(row.sellProceeds, row.baseCurrency)).position;
    } else if (row.entryType === "SPLIT") {
      const ratio = row.metadata["ratio"];
      if (typeof ratio !== "string") throw new Error("Split history is missing ratio");
      position = applySplit(current, ratio).position;
      if (position.quantity.toString() !== current.quantity.add(QuantityDelta.of(row.quantityDelta)).toString()) {
        throw new Error("Split history quantity does not match its ratio");
      }
    } else if (row.entryType === "MERGER_OUT") {
      const transfer = row.financialEventId ? transferByEvent.get(row.financialEventId) : undefined;
      const transferredCost = Money.of(transfer?.amount ?? "0", row.baseCurrency);
      const cashProceedsValue = row.eventMetadata?.["cashProceeds"];
      if (typeof cashProceedsValue !== "string") throw new Error("Merger history is missing cash proceeds");
      const cashProceeds = Money.of(cashProceedsValue, row.baseCurrency);
      const cashBasis = current.remainingCost.subtract(transferredCost);
      position = Object.freeze({
        quantity: Quantity.zero(),
        remainingCost: Money.zero(row.baseCurrency),
        realizedGainLoss: current.realizedGainLoss.add(cashProceeds.subtract(cashBasis)),
      });
    } else if (row.entryType === "MERGER_IN") {
      const transfer = requireTransfer(row, transferByEvent);
      position = addReorganizationPosition(current, Quantity.of(row.quantityDelta), Money.of(transfer.amount, row.baseCurrency));
    } else if (row.entryType === "SPINOFF_IN") {
      const transfer = requireTransfer(row, transferByEvent);
      const sourceKey = `${transfer.sourcePositionAccountId}\0${transfer.sourceSecurityId}`;
      const source = positions.get(sourceKey);
      if (!source) throw new Error("Spin-off history is missing its parent position");
      const amount = Money.of(transfer.amount, row.baseCurrency);
      positions.set(sourceKey, Object.freeze({ ...source, position: Object.freeze({
        quantity: source.position.quantity,
        remainingCost: source.position.remainingCost.subtract(amount),
        realizedGainLoss: source.position.realizedGainLoss,
      }) }));
      position = addReorganizationPosition(current, Quantity.of(row.quantityDelta), amount);
    } else {
      throw new Error(`Unsupported cost-basis history entry: ${row.entryType}`);
    }
    positions.set(key, Object.freeze({ positionAccountId: row.positionAccountId, securityId: row.securityId, position }));
  }
  return Object.freeze([...positions.values()]);
}

function mapRow(row: HistoryDbRow): CostBasisHistoryRow {
  if (!(["TRADE_BUY", "TRADE_SELL", "SPLIT", "MERGER_OUT", "MERGER_IN", "SPINOFF_IN"] as const).some((type) => type === row.entry_type)) {
    throw new Error(`Unsupported cost-basis history entry: ${row.entry_type}`);
  }
  return { financialEventId: row.financial_event_id, positionAccountId: row.position_account_id, securityId: row.security_id, baseCurrency: row.base_currency,
    entryType: row.entry_type as CostBasisHistoryRow["entryType"], quantityDelta: row.quantity_delta, buyCost: row.buy_cost,
    sellProceeds: row.sell_proceeds, metadata: row.metadata, eventMetadata: row.event_metadata };
}

function mapTransfer(row: TransferDbRow): BasisTransferHistoryRow {
  return { financialEventId: row.financial_event_id, sourcePositionAccountId: row.source_position_account_id,
    sourceSecurityId: row.source_security_id, targetPositionAccountId: row.target_position_account_id,
    targetSecurityId: row.target_security_id, amount: row.amount, currency: row.currency };
}

function requireTransfer(row: CostBasisHistoryRow, transfers: ReadonlyMap<string, BasisTransferHistoryRow>): BasisTransferHistoryRow {
  const transfer = row.financialEventId ? transfers.get(row.financialEventId) : undefined;
  if (!transfer || transfer.targetPositionAccountId !== row.positionAccountId || transfer.targetSecurityId !== row.securityId) {
    throw new Error("Reorganization history is missing matching basis-transfer evidence");
  }
  if (transfer.currency !== row.baseCurrency) throw new Error("Reorganization basis-transfer currency mismatch");
  return transfer;
}
