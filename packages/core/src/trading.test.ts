import { describe, expect, it } from "vitest";
import {
  Money,
  Price,
  Quantity,
  acceptOrder,
  assessObservationEligibility,
  assertCanReserveCash,
  assertCanReserveShares,
  requiredBuyReservation,
} from "./index.js";

const baseOrder = {
  id: "order:1" as never,
  environmentId: "environment:1",
  scope: "CAREER" as const,
  tradingAccountId: "account:1" as never,
  securityId: "security:1" as never,
  listingCurrency: "CAD" as const,
  side: "BUY" as const,
  type: "MARKET" as const,
  quantity: Quantity.of("2.5"),
  timeInForce: "DAY" as const,
  acceptedAt: "2026-09-12T14:00:00.000Z",
  exchangeIsOpen: true,
};

describe("trading policies", () => {
  it("accepts an open-session market order pending a verified price", () => {
    const order = acceptOrder(baseOrder);
    expect(order.status).toBe("PENDING_VERIFIED_PRICE");
    expect(requiredBuyReservation(order, Price.of("12.345", "CAD")).toString()).toBe("30.86250000");
  });

  it("queues orders while the exchange is closed", () => {
    expect(acceptOrder({ ...baseOrder, exchangeIsOpen: false }).status).toBe("PENDING_MARKET_OPEN");
  });

  it("requires coherent limit-order details", () => {
    expect(() => acceptOrder({ ...baseOrder, type: "LIMIT" })).toThrow("requires a limit price");
    expect(() =>
      acceptOrder({ ...baseOrder, type: "LIMIT", limitPrice: Price.of("10", "USD") }),
    ).toThrow("currency mismatch");
  });

  it("prevents cash and share double reservation", () => {
    expect(() =>
      assertCanReserveCash(
        { totalCash: Money.of("100", "CAD"), reservedCash: Money.of("80", "CAD") },
        Money.of("21", "CAD"),
      ),
    ).toThrow("Insufficient available cash");
    expect(() =>
      assertCanReserveShares(
        { ownedQuantity: Quantity.of("10"), reservedQuantity: Quantity.of("9.5") },
        Quantity.of("0.6"),
      ),
    ).toThrow("Insufficient available shares");
  });

  it("rejects observations from before order acceptance", () => {
    expect(
      assessObservationEligibility(
        {
          marketTimestamp: "2026-09-12T13:59:59.999Z",
          receivedAt: "2026-09-12T14:15:00.000Z",
          freshness: "DELAYED",
        },
        { acceptedAt: baseOrder.acceptedAt, now: "2026-09-12T14:15:00.000Z", maximumObservationAgeSeconds: 1200 },
      ),
    ).toEqual({ eligible: false, reason: "PRE_ORDER" });
  });

  it("accepts a delayed observation whose market timestamp is at or after the order", () => {
    expect(
      assessObservationEligibility(
        {
          marketTimestamp: "2026-09-12T14:00:00.000Z",
          receivedAt: "2026-09-12T14:15:00.000Z",
          freshness: "DELAYED",
        },
        { acceptedAt: baseOrder.acceptedAt, now: "2026-09-12T14:15:00.000Z", maximumObservationAgeSeconds: 1200 },
      ),
    ).toEqual({ eligible: true });
  });
});
