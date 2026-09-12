import { Price, Rate } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import { SyntheticMarketDataProvider } from "./synthetic-provider.js";
import type { MarketObservation, Security, SecurityId } from "./provider.js";

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
const observation: MarketObservation = {
  securityId,
  price: Price.of("42.125", "CAD"),
  marketTimestamp: new Date("2026-09-11T19:00:00.000Z"),
  receivedAt: new Date("2026-09-11T19:00:01.000Z"),
  freshness: "REALTIME",
  source: "SYNTHETIC",
  reference: "fixture:northstar:1",
};

describe("SyntheticMarketDataProvider", () => {
  const provider = new SyntheticMarketDataProvider([security], [observation], [
    {
      pair: "USD/CAD",
      basePerForeignRate: Rate.of("1.36"),
      marketTimestamp: new Date("2026-09-11T19:00:00.000Z"),
      receivedAt: new Date("2026-09-11T19:00:01.000Z"),
      freshness: "REALTIME",
      source: "SYNTHETIC",
      reference: "fixture:usdcad:1",
    },
  ], [{
    type: "SPLIT",
    id: "action:1",
    securityId,
    effectiveDate: "2026-09-15",
    ratio: "2",
    reference: "fixture:split:1",
  }]);

  it("searches explicitly fictional securities", async () => {
    await expect(provider.findSecurities("northstar")).resolves.toEqual([security]);
  });

  it("returns timestamped observations", async () => {
    await expect(provider.getLatestObservation(securityId)).resolves.toEqual(observation);
  });

  it("returns deterministic USD/CAD observations", async () => {
    expect((await provider.getLatestFxObservation("USD/CAD"))?.basePerForeignRate.toString()).toBe("1.360000000000");
  });

  it("returns corporate actions deterministically within an inclusive date range", async () => {
    await expect(provider.getCorporateActions("2026-09-15", "2026-09-15")).resolves.toEqual([
      expect.objectContaining({ id: "action:1", type: "SPLIT", ratio: "2" }),
    ]);
    await expect(provider.getCorporateActions("2026-09-16", "2026-09-20")).resolves.toEqual([]);
  });
});
