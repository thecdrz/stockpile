import { Price, Rate } from "@stockpile/core";
import type { ClaimedJob } from "@stockpile/database";
import { describe, expect, it, vi } from "vitest";
import { SyntheticMarketDataProvider, type Security, type SecurityId } from "@stockpile/market-data";
import { createOrderVerificationHandler } from "./order-verification-handler.js";

const securityId = "synthetic:ca:northstar" as SecurityId;
const security: Security = {
  id: securityId,
  symbol: "NSTAR",
  name: "Northstar Industries",
  exchange: "SYNTHETIC_CA",
  mic: "XTSE",
  currency: "CAD",
  kind: "STOCK",
};
const marketData = new SyntheticMarketDataProvider(
  [security],
  [
    {
      securityId,
      price: Price.of("42", "CAD"),
      marketTimestamp: new Date("2026-09-12T14:00:01.000Z"),
      receivedAt: new Date("2026-09-12T14:00:02.000Z"),
      freshness: "REALTIME",
      source: "SYNTHETIC",
      reference: "tick:1",
    },
  ],
);

function claimed(expiresAt = "2026-09-12T20:00:00.000Z"): ClaimedJob {
  return {
    id: "job:1",
    runId: "run:1",
    environmentId: "environment:1" as never,
    jobType: "ORDER_PRICE_VERIFICATION",
    payload: { orderId: "order:1", securityId, expiresAt, requiresUsdCad: false },
    runAt: "2026-09-12T14:00:00.000Z",
    attempt: 1,
    maxAttempts: 5,
    idempotencyKey: "verify:order:1:first",
  };
}

function options(settled: boolean) {
  return {
    marketData,
    settlement: { settle: vi.fn(async () => (settled ? ({ settled: true } as never) : { settled: false as const, reason: "LIMIT_NOT_CROSSED" as const })) },
    lifecycle: { expire: vi.fn(async () => undefined) },
    queue: { enqueue: vi.fn(async () => ({ id: "next-job", created: true })) },
    now: () => "2026-09-12T14:00:03.000Z",
    verificationIntervalSeconds: 30,
    maximumObservationAgeSeconds: 30,
    maximumFxAgeSeconds: 300,
    fxSpreadRate: Rate.of("0.002"),
    economyRulesetVersion: "1",
    executionPolicyVersion: "synthetic-tick-v1",
  };
}

describe("order verification handler", () => {
  it("settles against the latest normalized synthetic observation", async () => {
    const dependencies = options(true);
    await createOrderVerificationHandler(dependencies)(claimed());
    expect(dependencies.settlement.settle).toHaveBeenCalledOnce();
    expect(dependencies.queue.enqueue).not.toHaveBeenCalled();
  });

  it("schedules another durable verification when a limit has not crossed", async () => {
    const dependencies = options(false);
    await createOrderVerificationHandler(dependencies)(claimed());
    expect(dependencies.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ runAt: "2026-09-12T14:00:33.000Z" }),
    );
  });

  it("expires before requesting market data when time in force ended", async () => {
    const dependencies = options(true);
    await createOrderVerificationHandler(dependencies)(claimed("2026-09-12T14:00:03.000Z"));
    expect(dependencies.lifecycle.expire).toHaveBeenCalledOnce();
    expect(dependencies.settlement.settle).not.toHaveBeenCalled();
  });
});
