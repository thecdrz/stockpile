import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresSplitService } from "./postgres-split-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class SplitClient implements PgClientLike {
  readonly statements: string[] = [];
  released = false;
  applicationExists = false;

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("SELECT id, side, status FROM orders")) {
      return result([{ id: "order:1", side: "BUY", status: "OPEN" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("FROM position_cost_basis basis")) {
      return result([{
        position_account_id: "position:1",
        scope: "CAREER",
        currency: "CAD",
        quantity: "3",
        remaining_cost: "120",
        realized_gain_loss: "0",
        version: "4",
      }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("SELECT 1 FROM corporate_action_applications")) {
      return result(this.applicationExists ? [{ "?column?": 1 }] : []) as unknown as QueryResult<Row>;
    }
    if (text.includes("UPDATE cash_reservations") || text.includes("UPDATE position_cost_basis")) {
      return result([], 1) as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO outbox_events")) {
      return result([{ id: "outbox:1" }]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }

  release(): void { this.released = true; }
}

function poolFor(client: SplitClient): PgPoolLike {
  return { connect: async () => client, query: async <Row extends QueryResultRow>() => result<Row>() };
}

const command = {
  environmentId: "20000000-0000-4000-8000-000000000001" as never,
  action: {
    type: "SPLIT" as const,
    id: "provider:split:1",
    securityId: "40000000-0000-4000-8000-000000000001" as never,
    effectiveDate: "2026-09-15",
    ratio: "2",
    reference: "fixture:split:1",
  },
  appliedAt: "2026-09-15T12:00:00.000Z",
  economyRulesetVersion: "1",
};

describe("PostgresSplitService", () => {
  it("atomically cancels open orders and transforms quantity without changing cost", async () => {
    const client = new SplitClient();
    let sequence = 0;
    const service = new PostgresSplitService(poolFor(client), () => `generated:${++sequence}`);
    await expect(service.apply(command)).resolves.toEqual({ positionsChanged: 1, ordersCancelled: 1 });
    expect(client.statements.some((sql) => sql.includes("FOR UPDATE OF basis"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("quantity = $3"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("remaining_cost ="))).toBe(false);
    expect(client.statements.some((sql) => sql.includes("CORPORATE_ACTION"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
  });

  it("does not apply the same source action twice to a position", async () => {
    const client = new SplitClient();
    client.applicationExists = true;
    const service = new PostgresSplitService(poolFor(client), () => "unused");
    await expect(service.apply(command)).resolves.toEqual({ positionsChanged: 0, ordersCancelled: 1 });
    expect(client.statements.some((sql) => sql.includes("INSERT INTO security_quantity_entries"))).toBe(false);
  });
});
