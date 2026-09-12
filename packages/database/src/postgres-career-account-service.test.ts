import type { CorrelationId, EnvironmentId } from "@stockpile/ledger";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresCareerAccountService } from "./postgres-career-account-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class AccountOpeningClient implements PgClientLike {
  readonly commands: string[] = [];
  readonly journalValues: readonly unknown[][] = [];
  released = false;
  #accountInsert = 0;

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.commands.push(text.trim().split(/\s+/u)[0] ?? "");
    if (text.includes("INSERT INTO ledger_accounts")) {
      this.#accountInsert += 1;
      return result([{ id: this.#accountInsert === 1 ? playerCashId : systemEquityId }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO financial_events")) {
      return result([{ id: eventId }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO position_accounts")) {
      return result([{ id: positionAccountId }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO journal_entries")) {
      (this.journalValues as unknown[][]).push([...values]);
    }
    return result() as QueryResult<Row>;
  }

  release(): void {
    this.released = true;
  }
}

const environmentId = "20000000-0000-4000-8000-000000000001" as EnvironmentId;
const playerCashId = "50000000-0000-4000-8000-000000000001";
const systemEquityId = "50000000-0000-4000-8000-000000000002";
const eventId = "60000000-0000-4000-8000-000000000001";
const positionAccountId = "80000000-0000-4000-8000-000000000001";
const generatedIds = [
  "70000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000002",
  positionAccountId,
  eventId,
  "70000000-0000-4000-8000-000000000004",
  "70000000-0000-4000-8000-000000000005",
];

describe("PostgresCareerAccountService", () => {
  it("atomically creates scoped accounts and the opening grant", async () => {
    const client = new AccountOpeningClient();
    let idIndex = 0;
    const pool: PgPoolLike = {
      connect: async () => client,
      query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
    };
    const service = new PostgresCareerAccountService({
      pool,
      now: () => "2026-09-12T12:00:00.000Z",
      nextId: () => generatedIds[idIndex++] ?? "unexpected-id",
    });

    const opened = await service.open({
      environmentId,
      playerId: "discord-user:1",
      businessEffectiveAt: "2026-09-12T12:00:00.000Z",
      correlationId: "30000000-0000-4000-8000-000000000001" as CorrelationId,
      economyRulesetVersion: "1",
    });

    expect(opened.playerCashAccountId).toBe(playerCashId);
    expect(opened.systemEquityAccountId).toBe(systemEquityId);
    expect(opened.positionAccountId).toBe(positionAccountId);
    expect(opened.openingGrant.event.eventType).toBe("ACCOUNT_OPENING_GRANT");
    expect(opened.openingGrant.event.idempotencyKey).toBe("account-opening:discord-user:1:career");
    expect(client.commands).toEqual(["BEGIN", "INSERT", "INSERT", "INSERT", "INSERT", "INSERT", "INSERT", "COMMIT"]);
    expect(client.journalValues.map((values) => [values[5], values[6], values[7]])).toEqual([
      ["DEBIT", "100000.00000000", "CAD"],
      ["CREDIT", "100000.00000000", "CAD"],
    ]);
    expect(client.released).toBe(true);
  });
});
