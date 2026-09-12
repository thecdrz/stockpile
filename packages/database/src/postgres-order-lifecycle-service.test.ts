import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOrderLifecycleService } from "./postgres-order-lifecycle-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class LifecycleClient implements PgClientLike {
  readonly statements: string[] = [];
  released = false;

  constructor(private readonly status: string) {}

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("FROM orders WHERE id")) {
      return result([
        { id: "order:1", side: "BUY", status: this.status, expires_at: new Date("2026-09-12T20:00:00.000Z") },
      ]) as unknown as QueryResult<Row>;
    }
    if (text.includes("UPDATE cash_reservations")) return result([], 1) as QueryResult<Row>;
    return result<Row>();
  }

  release(): void {
    this.released = true;
  }
}

function poolFor(client: LifecycleClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

describe("PostgresOrderLifecycleService", () => {
  it("releases the reservation and cancels under the same order lock used by settlement", async () => {
    const client = new LifecycleClient("OPEN");
    const service = new PostgresOrderLifecycleService(poolFor(client), () => "event:cancel:1");
    await expect(service.cancel("order:1", "2026-09-12T19:00:00.000Z", "cancel:interaction:1")).resolves.toEqual({
      outcome: "CANCELLED",
      changed: true,
    });
    expect(client.statements[1]).toContain("FOR UPDATE");
    expect(client.statements.some((statement) => statement.includes("status = 'RELEASED'"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
  });

  it("returns the completed execution outcome when settlement won the race", async () => {
    const client = new LifecycleClient("FILLED");
    const service = new PostgresOrderLifecycleService(poolFor(client), () => "unused");
    await expect(service.cancel("order:1", "2026-09-12T19:00:00.000Z", "cancel:interaction:2")).resolves.toEqual({
      outcome: "ALREADY_FILLED",
      changed: false,
    });
    expect(client.statements.some((statement) => statement.includes("UPDATE cash_reservations"))).toBe(false);
  });

  it("does not expire an order early", async () => {
    const client = new LifecycleClient("OPEN");
    const service = new PostgresOrderLifecycleService(poolFor(client), () => "unused");
    await expect(service.expire("order:1", "2026-09-12T19:59:59.000Z", "expire:order:1")).rejects.toThrow(
      "has not reached",
    );
    expect(client.statements.at(-1)).toBe("ROLLBACK");
  });
});
