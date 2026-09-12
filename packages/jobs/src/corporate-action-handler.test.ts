import { Price } from "@stockpile/core";
import type { ClaimedJob } from "@stockpile/database";
import { describe, expect, it, vi } from "vitest";
import { SyntheticMarketDataProvider, type SecurityId } from "@stockpile/market-data";
import { createCorporateActionHandler } from "./corporate-action-handler.js";

const securityId = "security:1" as SecurityId;
const job: ClaimedJob = {
  id: "job:1", runId: "run:1", environmentId: "environment:1" as never,
  jobType: "PROCESS_CORPORATE_ACTIONS", payload: { fromDate: "2026-09-10", throughDate: "2026-09-15" },
  runAt: "2026-09-15T12:00:00.000Z", attempt: 1, maxAttempts: 8, idempotencyKey: "actions:2026-09-15",
};

describe("createCorporateActionHandler", () => {
  it("processes actions in stable date/id order with calendar-derived dividend entitlement", async () => {
    const provider = new SyntheticMarketDataProvider([], [], [], [
      { type: "SPLIT", id: "split:2", securityId, effectiveDate: "2026-09-15", ratio: "2", reference: "split-ref" },
      { type: "DIVIDEND", id: "dividend:1", securityId, exDate: "2026-09-10", paymentDate: "2026-09-15",
        amountPerShare: Price.of("1", "CAD"), reference: "dividend-ref" },
    ]);
    const calls: string[] = [];
    const handler = createCorporateActionHandler({
      marketData: provider,
      splits: { apply: vi.fn(async ({ action }) => { calls.push(action.id); }) },
      dividends: { credit: vi.fn(async ({ action, entitlementCutoff }) => { calls.push(`${action.id}:${entitlementCutoff}`); }) },
      calendar: { priorSessionClose: vi.fn(async () => "2026-09-09T20:00:00.000Z") },
      now: () => "2026-09-15T12:00:00.000Z", economyRulesetVersion: "1",
      baseCurrency: "CAD",
      lifecycle: { applySymbolChange: vi.fn(), applyDelisting: vi.fn(), placeInReview: vi.fn() },
      mergers: { settle: vi.fn() },
      spinoffs: { apply: vi.fn() },
    });
    await handler(job);
    expect(calls).toEqual(["dividend:1:2026-09-09T20:00:00.000Z", "split:2"]);
  });

  it("routes incomplete reorganizations to manual review without guessing terms", async () => {
    const provider = new SyntheticMarketDataProvider([], [], [], [{
      type: "MERGER", id: "merger:1", securityId, effectiveDate: "2026-09-15",
      termsComplete: false, reference: "merger-ref",
    }]);
    const placeInReview = vi.fn(async () => undefined);
    const handler = createCorporateActionHandler({
      marketData: provider, splits: { apply: vi.fn() }, dividends: { credit: vi.fn() },
      calendar: { priorSessionClose: vi.fn() }, now: () => "2026-09-15T12:00:00.000Z",
      economyRulesetVersion: "1", baseCurrency: "CAD",
      lifecycle: { applySymbolChange: vi.fn(), applyDelisting: vi.fn(), placeInReview },
      mergers: { settle: vi.fn() }, spinoffs: { apply: vi.fn() },
    });
    await handler(job);
    expect(placeInReview).toHaveBeenCalledOnce();
  });
});
