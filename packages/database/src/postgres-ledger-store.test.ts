import { Money } from "@stockpile/core";
import type { FinancialEvent, JournalEntry } from "@stockpile/ledger";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresLedgerStore } from "./postgres-ledger-store.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class RecordingClient implements PgClientLike {
  readonly calls: string[] = [];
  released = false;

  constructor(private readonly respond: (text: string) => QueryResult<QueryResultRow> = () => result()) {}

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.calls.push(text.trim().split(/\s+/u)[0] ?? "");
    return this.respond(text) as QueryResult<Row>;
  }

  release(): void {
    this.released = true;
  }
}

function poolFor(client: RecordingClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

const event: FinancialEvent = Object.freeze({
  id: "10000000-0000-4000-8000-000000000001" as never,
  environmentId: "20000000-0000-4000-8000-000000000001" as never,
  scope: "CAREER",
  eventType: "ACCOUNT_OPENING_GRANT",
  status: "POSTED",
  businessEffectiveAt: "2026-09-12T12:00:00.000Z",
  createdAt: "2026-09-12T12:00:00.000Z",
  postedAt: "2026-09-12T12:00:00.000Z",
  sourceType: "SYSTEM",
  sourceId: "account-opening:player:1",
  idempotencyKey: "account-opening:player:1:career",
  correlationId: "30000000-0000-4000-8000-000000000001" as never,
  economyRulesetVersion: "1",
});

const entries: readonly JournalEntry[] = [
  Object.freeze({
    id: "40000000-0000-4000-8000-000000000001" as never,
    financialEventId: event.id,
    ledgerAccountId: "50000000-0000-4000-8000-000000000001" as never,
    direction: "DEBIT",
    amount: Money.of("100000", "CAD"),
    createdAt: event.createdAt,
  }),
  Object.freeze({
    id: "40000000-0000-4000-8000-000000000002" as never,
    financialEventId: event.id,
    ledgerAccountId: "50000000-0000-4000-8000-000000000002" as never,
    direction: "CREDIT",
    amount: Money.of("100000", "CAD"),
    createdAt: event.createdAt,
  }),
];

describe("PostgresLedgerStore", () => {
  it("commits an event and all entries in one transaction", async () => {
    const client = new RecordingClient((text) =>
      text.includes("INSERT INTO financial_events") ? result([{ id: event.id }], 1) : result(),
    );
    const store = new PostgresLedgerStore(poolFor(client));

    const posted = await store.commit(event, entries);

    expect(posted).toEqual({ event, entries });
    expect(client.calls).toEqual(["BEGIN", "INSERT", "INSERT", "INSERT", "COMMIT"]);
    expect(client.released).toBe(true);
  });

  it("rolls the transaction back when an entry insert fails", async () => {
    let insertCount = 0;
    const client = new RecordingClient((text) => {
      if (text.includes("INSERT INTO financial_events")) return result([{ id: event.id }], 1);
      if (text.includes("INSERT INTO journal_entries") && ++insertCount === 2) throw new Error("database failure");
      return result();
    });
    const store = new PostgresLedgerStore(poolFor(client));

    await expect(store.commit(event, entries)).rejects.toThrow("database failure");
    expect(client.calls.at(-1)).toBe("ROLLBACK");
    expect(client.released).toBe(true);
  });
});
