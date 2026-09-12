import { Money, Price, Quantity, Rate } from "@stockpile/core";
import type { CareerPortfolioRecord } from "@stockpile/database";
import { describe, expect, it } from "vitest";
import { SyntheticMarketDataProvider, type Security, type SecurityId } from "@stockpile/market-data";
import { CareerDashboardService } from "./career-dashboard.js";

const securityId = "security:usd:1" as SecurityId;
const security: Security = {
  id: securityId,
  symbol: "ORBT",
  name: "Orbit Systems",
  exchange: "SYNTHETIC_US",
  mic: "XNAS",
  currency: "USD",
  kind: "STOCK",
};
const portfolio: CareerPortfolioRecord = {
  playerId: "player:1",
  displayName: "Scott",
  playerType: "HUMAN",
  financialStatus: "New Investor",
  creditRating: "C",
  baseCurrency: "CAD",
  cashBalance: Money.of("1000", "CAD"),
  reservedCash: Money.zero("CAD"),
  availableCash: Money.of("1000", "CAD"),
  positionAccountId: "position:1",
  holdings: [
    {
      securityId,
      symbol: "ORBT",
      name: "Orbit Systems",
      exchange: "SYNTHETIC_US",
      listingCurrency: "USD",
      kind: "STOCK",
      quantity: Quantity.of("2"),
      remainingCost: Money.of("200", "CAD"),
      realizedGainLoss: Money.zero("CAD"),
    },
  ],
};

describe("CareerDashboardService", () => {
  it("values foreign holdings in the environment base currency without applying a trade spread", async () => {
    const provider = new SyntheticMarketDataProvider(
      [security],
      [
        {
          securityId,
          price: Price.of("100", "USD"),
          marketTimestamp: new Date("2026-09-12T14:00:00.000Z"),
          receivedAt: new Date("2026-09-12T14:00:01.000Z"),
          freshness: "REALTIME",
          source: "SYNTHETIC",
          reference: "tick:1",
        },
      ],
      [
        {
          pair: "USD/CAD",
          basePerForeignRate: Rate.of("1.36"),
          marketTimestamp: new Date("2026-09-12T14:00:00.000Z"),
          receivedAt: new Date("2026-09-12T14:00:01.000Z"),
          freshness: "REALTIME",
          source: "SYNTHETIC",
          reference: "fx:1",
        },
      ],
    );
    const service = new CareerDashboardService(
      { getCareerByDiscordUser: async () => portfolio },
      provider,
      () => "2026-09-12T14:00:02.000Z",
    );
    const dashboard = await service.get("environment:1" as never, "discord:1");
    expect(dashboard?.holdings[0]?.marketValue?.toString()).toBe("272.00000000");
    expect(dashboard?.estimatedNetWorth.toString()).toBe("1272.00000000");
    expect(dashboard?.valuationComplete).toBe(true);
  });

  it("does not guess a missing market value", async () => {
    const service = new CareerDashboardService(
      { getCareerByDiscordUser: async () => portfolio },
      new SyntheticMarketDataProvider([security], []),
      () => "2026-09-12T14:00:02.000Z",
    );
    const dashboard = await service.get("environment:1" as never, "discord:1");
    expect(dashboard?.holdings[0]?.marketValue).toBeNull();
    expect(dashboard?.estimatedNetWorth.toString()).toBe("1000.00000000");
    expect(dashboard?.valuationComplete).toBe(false);
  });
});
