import { Money, Quantity } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresNetWorthSnapshotStore } from "./postgres-net-worth-snapshot-store.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class SnapshotClient implements PgClientLike {
  readonly statements: string[] = [];
  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("INSERT INTO net_worth_snapshots")) return result([{ id: "snapshot:1" }]) as unknown as QueryResult<Row>;
    return result<Row>();
  }
  release(): void {}
}

describe("PostgresNetWorthSnapshotStore", () => {
  it("stores a complete immutable valuation and calculates net worth exactly", async () => {
    const client = new SnapshotClient();
    const pool: PgPoolLike = { connect: async () => client, query: async <Row extends QueryResultRow>() => result<Row>() };
    const store = new PostgresNetWorthSnapshotStore(pool, () => "snapshot:1");
    const saved = await store.save({
      environmentId: "environment:1" as never, playerId: "player:1", scope: "CAREER",
      effectiveAt: "2026-09-12T20:00:00.000Z", cash: Money.of("1000", "CAD"),
      positions: [{ securityId: "security:1", quantity: Quantity.of("2"), marketValue: Money.of("500", "CAD"), marketDataReference: "tick:1" }],
      prestigeLiquidationValue: Money.of("75", "CAD"), collectibleLoanReceivables: Money.of("25", "CAD"),
      totalDebt: Money.of("100", "CAD"), accruedInterest: Money.of("5", "CAD"),
      valuationRulesetVersion: "1", sourceKey: "close:2026-09-12", createdAt: "2026-09-12T20:01:00.000Z",
    });
    expect(saved.netWorth.toString()).toBe("1495.00000000");
    expect(client.statements.some((sql) => sql.includes("net_worth_snapshot_positions"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
  });
});
