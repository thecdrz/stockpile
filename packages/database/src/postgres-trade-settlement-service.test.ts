import { Price, Rate } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresTradeSettlementService } from "./postgres-trade-settlement-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = []): QueryResult<Row> {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

class SettlementClient implements PgClientLike {
  readonly statements: string[] = [];
  readonly journalValues: unknown[][] = [];
  tradeExecutionValues: readonly unknown[] | undefined;
  released = false;

  constructor(
    private readonly listingCurrency: "CAD" | "USD" = "CAD",
    private readonly baseCurrency: "CAD" | "USD" = "CAD",
    private readonly reservedAmount = "200.00000000",
  ) {}

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("FROM trade_executions WHERE")) return result<Row>();
    if (text.includes("FROM orders JOIN environments")) {
      return result([
        {
          id: orderId,
          environment_id: environmentId,
          scope: "CAREER",
          position_account_id: positionAccountId,
          player_cash_account_id: cashAccountId,
          security_id: securityId,
          side: "BUY",
          order_type: "MARKET",
          status: "PENDING_VERIFIED_PRICE",
          quantity: "2.000000000000",
          limit_price: null,
          listing_currency: this.listingCurrency,
          accepted_at: new Date("2026-09-12T14:00:00.000Z"),
          base_currency: this.baseCurrency,
        },
      ]) as unknown as QueryResult<Row>;
    }
    if (text.includes("FROM cash_reservations WHERE")) {
      return result([{ id: reservationId, amount: this.reservedAmount, currency: this.baseCurrency }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO ledger_accounts")) {
      return result([{ id: text.includes("SYSTEM_FX_SPREAD_INCOME") ? fxSpreadAccountId : clearingAccountId }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO financial_events")) {
      return result([{ id: "generated:2" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("FROM position_cost_basis")) return result<Row>();
    if (text.includes("INSERT INTO journal_entries")) this.journalValues.push([...values]);
    if (text.includes("INSERT INTO trade_executions")) this.tradeExecutionValues = [...values];
    if (text.includes("INSERT INTO outbox_events")) {
      return result([{ id: "outbox:1" }]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }

  release(): void {
    this.released = true;
  }
}

const orderId = "10000000-0000-4000-8000-000000000001";
const environmentId = "20000000-0000-4000-8000-000000000001";
const positionAccountId = "30000000-0000-4000-8000-000000000001";
const cashAccountId = "40000000-0000-4000-8000-000000000001";
const securityId = "50000000-0000-4000-8000-000000000001";
const reservationId = "60000000-0000-4000-8000-000000000001";
const clearingAccountId = "70000000-0000-4000-8000-000000000001";
const fxSpreadAccountId = "70000000-0000-4000-8000-000000000002";

function poolFor(client: SettlementClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

describe("PostgresTradeSettlementService", () => {
  it("atomically settles a gap-up buy by reducing quantity to reserved affordability", async () => {
    const client = new SettlementClient();
    let sequence = 0;
    const service = new PostgresTradeSettlementService(poolFor(client), () => `generated:${++sequence}`);

    const settled = await service.settle({
      orderId,
      observation: {
        securityId,
        price: Price.of("125", "CAD"),
        marketTimestamp: "2026-09-12T14:00:01.000Z",
        receivedAt: "2026-09-12T14:00:02.000Z",
        freshness: "REALTIME",
        reference: "synthetic:tick:1",
      },
      now: "2026-09-12T14:00:03.000Z",
      maximumObservationAgeSeconds: 30,
      economyRulesetVersion: "1",
      executionPolicyVersion: "synthetic-tick-v1",
    });

    expect(settled.settled).toBe(true);
    if (!settled.settled) throw new Error("Expected settlement");
    expect(settled.executedQuantity.toString()).toBe("1.600000000000");
    expect(settled.baseNotional.toString()).toBe("200.00000000");
    expect(client.tradeExecutionValues?.[4]).toBe("1.600000000000");
    expect(client.statements.some((statement) => statement.includes("INSERT INTO security_quantity_entries"))).toBe(true);
    expect(client.statements.some((statement) => statement.includes("SET status = 'CONSUMED'"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
    expect(client.released).toBe(true);
  });

  it("rejects a pre-order observation and rolls back without a financial event", async () => {
    const client = new SettlementClient();
    const service = new PostgresTradeSettlementService(poolFor(client), () => "generated:1");

    await expect(
      service.settle({
        orderId,
        observation: {
          securityId,
          price: Price.of("100", "CAD"),
          marketTimestamp: "2026-09-12T13:59:59.000Z",
          receivedAt: "2026-09-12T14:00:02.000Z",
          freshness: "DELAYED",
          reference: "synthetic:tick:old",
        },
        now: "2026-09-12T14:00:03.000Z",
        maximumObservationAgeSeconds: 1200,
        economyRulesetVersion: "1",
        executionPolicyVersion: "synthetic-tick-v1",
      }),
    ).rejects.toThrow("PRE_ORDER");

    expect(client.statements.some((statement) => statement.includes("INSERT INTO financial_events"))).toBe(false);
    expect(client.statements.at(-1)).toBe("ROLLBACK");
  });

  it("settles a USD buy in CAD with permanent FX and spread evidence", async () => {
    const client = new SettlementClient("USD", "CAD", "136.27200000");
    let sequence = 0;
    const service = new PostgresTradeSettlementService(poolFor(client), () => `generated:${++sequence}`);

    const settled = await service.settle({
      orderId,
      observation: {
        securityId,
        price: Price.of("100", "USD"),
        marketTimestamp: "2026-09-12T14:00:01.000Z",
        receivedAt: "2026-09-12T14:00:02.000Z",
        freshness: "REALTIME",
        reference: "synthetic:usd-tick:1",
      },
      fx: {
        basePerForeignRate: Rate.of("1.36"),
        spreadRate: Rate.of("0.002"),
        marketTimestamp: "2026-09-12T14:00:01.000Z",
        receivedAt: "2026-09-12T14:00:02.000Z",
        freshness: "REALTIME",
        reference: "synthetic:usdcad:1",
      },
      now: "2026-09-12T14:00:03.000Z",
      maximumObservationAgeSeconds: 30,
      maximumFxAgeSeconds: 300,
      economyRulesetVersion: "1",
      executionPolicyVersion: "synthetic-tick-v1",
    });

    expect(settled.settled && settled.baseNotional.toString()).toBe("136.27200000");
    expect(client.journalValues.map((values) => [values[5], values[6], values[7]])).toEqual([
      ["DEBIT", "136.00000000", "CAD"],
      ["DEBIT", "0.27200000", "CAD"],
      ["CREDIT", "136.27200000", "CAD"],
    ]);
    expect(client.tradeExecutionValues?.slice(14, 21)).toEqual([
      "100.00000000",
      "1.360000000000",
      "2026-09-12T14:00:01.000Z",
      "2026-09-12T14:00:02.000Z",
      "synthetic:usdcad:1",
      "0.002000000000",
      "0.27200000",
    ]);
  });
});
