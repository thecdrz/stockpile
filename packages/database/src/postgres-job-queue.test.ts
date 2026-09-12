import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresJobQueue } from "./postgres-job-queue.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class JobClient implements PgClientLike {
  readonly statements: string[] = [];
  released = false;

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("RETURNING job.id")) {
      return result([
        {
          id: "job:1",
          environment_id: "environment:1",
          job_type: "ORDER_PRICE_VERIFICATION",
          payload: { orderId: "order:1" },
          run_at: new Date("2026-09-12T12:00:00.000Z"),
          attempts: 1,
          max_attempts: 5,
          idempotency_key: "verify:order:1",
        },
      ]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }

  release(): void {
    this.released = true;
  }
}

function poolFor(client: JobClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

describe("PostgresJobQueue", () => {
  it("claims one due job with skip-locked leasing and records its run", async () => {
    const client = new JobClient();
    const queue = new PostgresJobQueue(poolFor(client), () => "run:1");
    const claimed = await queue.claim("worker:1", "2026-09-12T12:00:00.000Z", 60);
    expect(claimed).toMatchObject({ id: "job:1", runId: "run:1", attempt: 1, maxAttempts: 5 });
    expect(client.statements.some((statement) => statement.includes("FOR UPDATE SKIP LOCKED"))).toBe(true);
    expect(client.statements.some((statement) => statement.includes("INSERT INTO job_runs"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
    expect(client.released).toBe(true);
  });
});
