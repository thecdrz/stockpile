import { Price } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresMergerService } from "./postgres-merger-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class MergerClient implements PgClientLike {
  readonly statements: Array<{ text: string; values?: readonly unknown[] }> = [];
  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>> {
    this.statements.push(values === undefined ? { text } : { text, values });
    if (text.includes("SELECT id,side,status FROM orders")) return result([{ id: "order:1", side: "BUY", status: "OPEN" }]) as unknown as QueryResult<Row>;
    if (text.includes("FROM position_cost_basis basis")) return result([{
      position_account_id: "position:1", scope: "CAREER", owner_id: "player:1", cash_account_id: "cash:1",
      base_currency: "CAD", quantity: "10", remaining_cost: "100", realized_gain_loss: "0", version: "2",
    }]) as unknown as QueryResult<Row>;
    if (text.includes("SELECT 1 FROM corporate_action_applications")) return result<Row>();
    if (text.includes("FROM position_cost_basis WHERE")) return result<Row>();
    if (text.includes("UPDATE cash_reservations") || text.includes("UPDATE position_cost_basis SET quantity=0")) return result([], 1) as QueryResult<Row>;
    if (text.includes("INSERT INTO ledger_accounts")) return result([{ id: "clearing:1" }]) as unknown as QueryResult<Row>;
    if (text.includes("INSERT INTO outbox_events")) return result([{ id: "outbox:1" }]) as unknown as QueryResult<Row>;
    return result<Row>();
  }
  release(): void {}
}

describe("PostgresMergerService", () => {
  it("settles mixed consideration atomically with cash journal, replacement shares, and basis transfer", async () => {
    const client = new MergerClient();
    let sequence = 0;
    const pool: PgPoolLike = { connect: async () => client, query: async <Row extends QueryResultRow>() => result<Row>() };
    const service = new PostgresMergerService(pool, () => `generated:${++sequence}`);
    await expect(service.settle("environment:1" as never, {
      type: "MERGER", id: "merger:1", securityId: "security:old" as never, effectiveDate: "2026-09-15",
      termsComplete: true, cashPerShare: Price.of("6", "CAD"), stockSecurityId: "security:new" as never,
      stockRatio: "0.5", stockBasisPercentage: "0.4", reference: "fixture:merger:1",
    }, "2026-09-15T12:00:00.000Z", "1")).resolves.toEqual({ positionsSettled: 1, ordersCancelled: 1 });
    const quantityEntries = client.statements.filter(({ text }) => text.includes("INSERT INTO security_quantity_entries"));
    expect(quantityEntries).toHaveLength(2);
    expect(quantityEntries[0]?.values?.[6]).toBe("-10.000000000000");
    expect(quantityEntries[1]?.values?.[6]).toBe("5.000000000000");
    expect(client.statements.filter(({ text }) => text.includes("INSERT INTO journal_entries"))).toHaveLength(2);
    expect(client.statements.some(({ text }) => text.includes("corporate_action_basis_transfers"))).toBe(true);
    expect(client.statements.some(({ text }) => text.includes("trading_status='DELISTED'"))).toBe(true);
    expect(client.statements.at(-1)?.text).toBe("COMMIT");
  });
});
