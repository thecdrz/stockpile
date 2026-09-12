import { Price, Rate } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresDividendService } from "./postgres-dividend-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class DividendClient implements PgClientLike {
  readonly statements: Array<{ text: string; values?: readonly unknown[] }> = [];
  released = false;
  applicationExists = false;

  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>> {
    this.statements.push(values === undefined ? { text } : { text, values });
    if (text.includes("sum(entry.quantity_delta)")) {
      return result([{
        position_account_id: "position:1", scope: "CAREER", owner_id: "player:1",
        cash_account_id: "cash:1", base_currency: "CAD", quantity: "2.5",
      }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("SELECT 1 FROM corporate_action_applications")) {
      return result(this.applicationExists ? [{ "?column?": 1 }] : []) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO ledger_accounts")) {
      return result([{ id: "clearing:1" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO outbox_events")) {
      return result([{ id: "outbox:1" }]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }
  release(): void { this.released = true; }
}

function poolFor(client: DividendClient): PgPoolLike {
  return { connect: async () => client, query: async <Row extends QueryResultRow>() => result<Row>() };
}

const action = {
  type: "DIVIDEND" as const,
  id: "provider:dividend:1",
  securityId: "40000000-0000-4000-8000-000000000001" as never,
  exDate: "2026-09-10",
  paymentDate: "2026-09-15",
  amountPerShare: Price.of("1.20", "USD"),
  reference: "fixture:dividend:1",
};

describe("PostgresDividendService", () => {
  it("credits the ex-date quantity with authoritative FX and a balanced journal", async () => {
    const client = new DividendClient();
    let sequence = 0;
    const service = new PostgresDividendService(poolFor(client), () => `generated:${++sequence}`);
    await expect(service.credit({
      environmentId: "environment:1" as never,
      action,
      entitlementCutoff: "2026-09-09T20:00:00.000Z",
      processedAt: "2026-09-15T12:00:00.000Z",
      economyRulesetVersion: "1",
      basePerForeignRate: Rate.of("1.36"),
      fxReference: "fixture:fx:1",
    })).resolves.toEqual({ playersCredited: 1 });
    const journal = client.statements.filter(({ text }) => text.includes("INSERT INTO journal_entries"));
    expect(journal).toHaveLength(2);
    expect(journal[0]?.values?.[6]).toBe("4.08000000");
    expect(journal[1]?.values?.[6]).toBe("4.08000000");
    expect(client.statements.at(-1)?.text).toBe("COMMIT");
  });

  it("uses immutable entitlement history rather than current holdings and skips an applied action", async () => {
    const client = new DividendClient();
    client.applicationExists = true;
    const service = new PostgresDividendService(poolFor(client), () => "unused");
    await expect(service.credit({
      environmentId: "environment:1" as never,
      action: { ...action, amountPerShare: Price.of("1.20", "CAD") },
      entitlementCutoff: "2026-09-09T20:00:00.000Z",
      processedAt: "2026-09-15T12:00:00.000Z",
      economyRulesetVersion: "1",
    })).resolves.toEqual({ playersCredited: 0 });
    expect(client.statements.some(({ text }) => text.includes("INSERT INTO journal_entries"))).toBe(false);
  });
});
