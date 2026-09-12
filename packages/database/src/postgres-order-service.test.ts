import { Price, Quantity, acceptOrder } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOrderService } from "./postgres-order-service.js";

function result<Row extends QueryResultRow>(rows: Row[] = []): QueryResult<Row> {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

class OrderClient implements PgClientLike {
  readonly statements: string[] = [];
  released = false;

  constructor(private readonly availableCash: string) {}

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("SELECT id FROM orders")) return result<Row>();
    if (text.includes("SELECT la.kind")) {
      return result([{ kind: "PLAYER_CASH", base_currency: "CAD" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("FROM journal_entries")) {
      return result([{ amount: this.availableCash }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("FROM cash_reservations")) {
      return result([{ amount: "0" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO orders")) {
      return result([{ id: "10000000-0000-4000-8000-000000000001" }]) as unknown as QueryResult<Row>;
    }
    if (text.includes("INSERT INTO durable_jobs")) {
      return result([{ id: "job:1" }]) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }

  release(): void {
    this.released = true;
  }
}

function acceptedBuy() {
  return acceptOrder({
    id: "10000000-0000-4000-8000-000000000001" as never,
    environmentId: "20000000-0000-4000-8000-000000000001",
    scope: "CAREER",
    tradingAccountId: "30000000-0000-4000-8000-000000000001" as never,
    securityId: "40000000-0000-4000-8000-000000000001" as never,
    listingCurrency: "CAD",
    side: "BUY",
    type: "MARKET",
    quantity: Quantity.of("2"),
    timeInForce: "DAY",
    acceptedAt: "2026-09-12T14:00:00.000Z",
    exchangeIsOpen: true,
  });
}

function poolFor(client: OrderClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

describe("PostgresOrderService", () => {
  it("locks available cash and creates the order, reservation, and audit event atomically", async () => {
    const client = new OrderClient("1000");
    let sequence = 0;
    const service = new PostgresOrderService(poolFor(client), () => `generated:${++sequence}`);

    const accepted = await service.accept({
      order: acceptedBuy(),
      playerCashAccountId: "50000000-0000-4000-8000-000000000001" as never,
      idempotencyKey: "discord-interaction:1",
      expiresAt: "2026-09-12T20:00:00.000Z",
      estimatedMarketPrice: Price.of("100", "CAD"),
      verificationJob: {
        environmentId: "20000000-0000-4000-8000-000000000001" as never,
        jobType: "VERIFY_ORDER",
        payload: { orderId: "10000000-0000-4000-8000-000000000001" },
        runAt: "2026-09-12T14:00:00.000Z",
        maxAttempts: 8,
        idempotencyKey: "verify-order:10000000-0000-4000-8000-000000000001",
      },
    });

    expect(accepted.created).toBe(true);
    expect(client.statements.some((statement) => statement.includes("FOR UPDATE OF la"))).toBe(true);
    expect(client.statements.some((statement) => statement.includes("INSERT INTO cash_reservations"))).toBe(true);
    expect(client.statements.some((statement) => statement.includes("INSERT INTO order_events"))).toBe(true);
    expect(client.statements.some((statement) => statement.includes("INSERT INTO durable_jobs"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
    expect(client.released).toBe(true);
  });

  it("rejects over-reservation and rolls back without inserting an order", async () => {
    const client = new OrderClient("100");
    const service = new PostgresOrderService(poolFor(client), () => "generated:1");

    await expect(
      service.accept({
        order: acceptedBuy(),
        playerCashAccountId: "50000000-0000-4000-8000-000000000001" as never,
        idempotencyKey: "discord-interaction:2",
        expiresAt: "2026-09-12T20:00:00.000Z",
        estimatedMarketPrice: Price.of("100", "CAD"),
        verificationJob: {
          environmentId: "20000000-0000-4000-8000-000000000001" as never,
          jobType: "VERIFY_ORDER",
          payload: { orderId: "10000000-0000-4000-8000-000000000001" },
          runAt: "2026-09-12T14:00:00.000Z",
          maxAttempts: 8,
          idempotencyKey: "verify-order:10000000-0000-4000-8000-000000000001",
        },
      }),
    ).rejects.toThrow("Insufficient available cash");

    expect(client.statements.some((statement) => statement.includes("INSERT INTO orders"))).toBe(false);
    expect(client.statements.at(-1)).toBe("ROLLBACK");
  });
});
