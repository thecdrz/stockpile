import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresSecurityLifecycleService } from "./postgres-security-lifecycle-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class LifecycleClient implements PgClientLike {
  readonly statements: string[] = [];
  replay = false;
  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("SELECT 1 FROM security_status_events")) return result(this.replay ? [{ ok: 1 }] : []) as unknown as QueryResult<Row>;
    if (text.includes("SELECT symbol, trading_status")) return result([{ symbol: "OLD", trading_status: "ACTIVE" }]) as unknown as QueryResult<Row>;
    if (text.includes("SELECT id,side,status FROM orders")) return result([{ id: "order:1", side: "BUY", status: "OPEN" }]) as unknown as QueryResult<Row>;
    if (text.includes("UPDATE cash_reservations")) return result([], 1) as QueryResult<Row>;
    if (text.includes("INSERT INTO outbox_events")) return result([{ id: "outbox:1" }]) as unknown as QueryResult<Row>;
    return result<Row>();
  }
  release(): void {}
}

function poolFor(client: LifecycleClient): PgPoolLike {
  return { connect: async () => client, query: async <Row extends QueryResultRow>() => result<Row>() };
}

describe("PostgresSecurityLifecycleService", () => {
  it("preserves identity and old ticker while cancelling open orders on a symbol change", async () => {
    const client = new LifecycleClient();
    const service = new PostgresSecurityLifecycleService(poolFor(client), () => "generated:1");
    await expect(service.applySymbolChange("environment:1" as never, {
      type: "SYMBOL_CHANGE", id: "action:1", securityId: "security:1" as never,
      effectiveDate: "2026-09-15", newSymbol: "NEW", reference: "fixture:symbol:1",
    }, "2026-09-15T12:00:00.000Z")).resolves.toEqual({ changed: true, ordersCancelled: 1 });
    expect(client.statements.some((sql) => sql.includes("security_symbol_aliases"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("security_status_events"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
  });

  it("suspends incomplete merger terms and emits a durable admin alert", async () => {
    const client = new LifecycleClient();
    const service = new PostgresSecurityLifecycleService(poolFor(client), () => "generated:1");
    await service.placeInReview("environment:1" as never, {
      type: "MERGER", id: "action:2", securityId: "security:1" as never,
      effectiveDate: "2026-09-15", termsComplete: false, reference: "fixture:merger:2",
    }, "2026-09-15T12:00:00.000Z");
    expect(client.statements.some((sql) => sql.includes("CORPORATE_ACTION_REVIEW"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("operational_alerts"))).toBe(true);
  });
});
