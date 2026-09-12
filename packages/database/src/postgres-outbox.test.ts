import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOutbox } from "./postgres-outbox.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class OutboxPool implements PgPoolLike {
  readonly statements: string[] = [];

  async connect(): Promise<PgClientLike> {
    throw new Error("not used");
  }

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("RETURNING event.id")) {
      return result([
        {
          id: "outbox:1",
          environment_id: "environment:1",
          event_type: "TradeExecuted",
          payload: { orderId: "order:1" },
          destination: "DISCORD",
          attempts: 1,
          max_attempts: 8,
          idempotency_key: "trade:order:1",
        },
      ]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }
}

describe("PostgresOutbox", () => {
  it("claims an event for exactly one destination worker with a lease", async () => {
    const pool = new OutboxPool();
    const outbox = new PostgresOutbox(pool, () => "unused");
    const claimed = await outbox.claim("DISCORD", "worker:1", "2026-09-12T12:00:00.000Z", 60);
    expect(claimed).toMatchObject({ id: "outbox:1", attempt: 1, eventType: "TradeExecuted" });
    expect(pool.statements.some((statement) => statement.includes("FOR UPDATE SKIP LOCKED"))).toBe(true);
  });
});
