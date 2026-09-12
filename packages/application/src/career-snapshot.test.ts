import { Money, Quantity } from "@stockpile/core";
import { describe, expect, it, vi } from "vitest";
import { CareerSnapshotService } from "./career-snapshot.js";

function dashboard(complete: boolean) {
  return {
    playerId: "player:1", displayName: "Scott", playerType: "HUMAN" as const,
    financialStatus: "New Investor", creditRating: "C", baseCurrency: "CAD" as const,
    cashBalance: Money.of("1000", "CAD"), reservedCash: Money.zero("CAD"), availableCash: Money.of("1000", "CAD"),
    holdings: [{ securityId: "security:1", symbol: "ORBT", name: "Orbit", exchange: "SYNTHETIC_CA",
      listingCurrency: "CAD" as const, kind: "STOCK" as const, quantity: Quantity.of("2"), remainingCost: Money.of("100", "CAD"),
      realizedGainLoss: Money.zero("CAD"), latestPrice: complete ? "50" : null, priceAsOf: complete ? "2026-09-12T20:00:00.000Z" : null,
      marketValue: complete ? Money.of("100", "CAD") : null, valuationStatus: complete ? "FRESH" as const : "UNAVAILABLE" as const,
      marketDataReference: complete ? "tick:1" : null, fxReference: null }],
    estimatedNetWorth: Money.of(complete ? "1100" : "1000", "CAD"), valuationComplete: complete,
  };
}

describe("CareerSnapshotService", () => {
  it("refuses to publish an official snapshot from incomplete prices", async () => {
    const save = vi.fn();
    const service = new CareerSnapshotService({ get: vi.fn(async () => dashboard(false)) } as never, { save }, () => "2026-09-12T20:01:00.000Z");
    await expect(service.capture({ environmentId: "environment:1" as never, discordUserId: "discord:1",
      effectiveAt: "2026-09-12T20:00:00.000Z", sourceKey: "close:2026-09-12", valuationRulesetVersion: "1" }))
      .rejects.toThrow("complete fresh valuation");
    expect(save).not.toHaveBeenCalled();
  });
});
