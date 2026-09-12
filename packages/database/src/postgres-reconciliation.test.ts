import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresReconciliationService } from "./postgres-reconciliation.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class ReconciliationClient implements PgClientLike {
  readonly statements: string[] = [];
  released = false;

  constructor(private readonly includeViolation: boolean) {}

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (this.includeViolation && text.includes("FROM reservations LEFT JOIN balances")) {
      return result([
        {
          ledger_account_id: "cash:1",
          currency: "CAD",
          cash_balance: "100.00000000",
          reserved_amount: "101.00000000",
        },
      ]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }

  release(): void {
    this.released = true;
  }
}

function poolFor(client: ReconciliationClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

describe("PostgresReconciliationService", () => {
  it("records a passing consistent-snapshot reconciliation", async () => {
    const client = new ReconciliationClient(false);
    const service = new PostgresReconciliationService(poolFor(client), () => "reconciliation:1", () => "2026-09-12T12:00:00.000Z");
    const report = await service.run("environment:1" as never);
    expect(report.status).toBe("PASSED");
    expect(report.violations).toEqual([]);
    expect(client.statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ");
    expect(client.statements.at(-1)).toBe("COMMIT");
  });

  it("persists a critical alert without repairing an invariant failure", async () => {
    const client = new ReconciliationClient(true);
    let sequence = 0;
    const service = new PostgresReconciliationService(
      poolFor(client),
      () => `generated:${++sequence}`,
      () => "2026-09-12T12:00:00.000Z",
    );
    const report = await service.run("environment:1" as never);
    expect(report.status).toBe("FAILED");
    expect(report.violations[0]).toMatchObject({ check: "CASH_RESERVATION" });
    expect(client.statements.some((statement) => statement.includes("INSERT INTO operational_alerts"))).toBe(true);
  });
});
