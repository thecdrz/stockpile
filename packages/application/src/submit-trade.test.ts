import { Price, Rate } from "@stockpile/core";
import type { AcceptOrderPersistenceCommand } from "@stockpile/database";
import { describe, expect, it, vi } from "vitest";
import { SyntheticMarketDataProvider, type Security, type SecurityId } from "@stockpile/market-data";
import { SubmitTradeService } from "./submit-trade.js";

const securityId = "security:1" as SecurityId;
const security: Security = {
  id: securityId,
  symbol: "ORBT",
  name: "Orbit Systems",
  exchange: "SYNTHETIC_CA",
  mic: "XTSE",
  currency: "CAD",
  kind: "STOCK",
};
const provider = new SyntheticMarketDataProvider([security], [{
  securityId,
  price: Price.of("50", "CAD"),
  marketTimestamp: new Date("2026-09-12T14:00:00.000Z"),
  receivedAt: new Date("2026-09-12T14:00:01.000Z"),
  freshness: "REALTIME",
  source: "SYNTHETIC",
  reference: "tick:1",
}]);

function service(overrides: { authorized?: boolean } = {}) {
  const accept = vi.fn(async (command: AcceptOrderPersistenceCommand) => ({
    orderId: command.order.id,
    created: true,
    reservationId: "reservation:1",
  }));
  return {
    accept,
    value: new SubmitTradeService({
      contexts: {
        resolve: vi.fn(async () => overrides.authorized === false ? null : ({
          tradingAccountId: "position:1" as never,
          playerCashAccountId: "cash:1" as never,
          securityId,
          listingCurrency: "CAD" as const,
          baseCurrency: "CAD" as const,
        })),
      },
      marketData: provider,
      sessions: { getSession: vi.fn(async () => ({ isOpen: true })) },
      expirations: { expirationFor: vi.fn(async () => "2026-09-12T20:00:00.000Z") },
      orders: { accept },
      nextId: () => "order:1",
      now: () => "2026-09-12T14:00:02.000Z",
      fxSpreadRate: Rate.of("0.002"),
      verificationMaximumAttempts: 8,
    }),
  };
}

const request = {
  environmentId: "environment:1" as never,
  discordUserId: "discord:1",
  actionRequestId: "interaction:1",
  scope: "CAREER" as const,
  securityId,
  side: "BUY" as const,
  type: "MARKET" as const,
  quantity: "2",
  timeInForce: "DAY" as const,
};

describe("SubmitTradeService", () => {
  it("resolves ownership and submits an order plus verification job under one interaction key", async () => {
    const subject = service();
    await subject.value.submit(request);
    expect(subject.accept).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "discord:interaction:1",
      estimatedMarketPrice: expect.objectContaining({ currency: "CAD" }),
      verificationJob: expect.objectContaining({
        jobType: "VERIFY_ORDER",
        idempotencyKey: "verify-order:order:1",
      }),
    }));
  });

  it("rejects a user who cannot resolve the environment-scoped account", async () => {
    const subject = service({ authorized: false });
    await expect(subject.value.submit(request)).rejects.toThrow("Trading account or security is unavailable");
    expect(subject.accept).not.toHaveBeenCalled();
  });
});
