import { describe, expect, it } from "vitest";
import { MVP_SECURITIES, MvpAlwaysOpenSessionPolicy, MvpSyntheticMarketDataProvider } from "./synthetic-market.js";

describe("MvpSyntheticMarketDataProvider", () => {
  it("offers fictional Canadian and US securities and fresh deterministic prices", async () => {
    const now = new Date("2026-09-12T16:30:00.000Z");
    const provider = new MvpSyntheticMarketDataProvider(() => now);
    expect((await provider.findSecurities("maple")).map((security) => security.symbol)).toEqual(["MAPL"]);
    const first = await provider.getLatestObservation(MVP_SECURITIES[0]!.id);
    const second = await provider.getLatestObservation(MVP_SECURITIES[0]!.id);
    expect(first).toEqual(second);
    expect(first?.freshness).toBe("REALTIME");
    expect(first?.price.currency).toBe("CAD");
  });

  it("keeps the explicitly synthetic sandbox continuously playable", async () => {
    const sessions = new MvpAlwaysOpenSessionPolicy();
    expect(await sessions.getSession(MVP_SECURITIES[0]!.id, "2026-09-12T16:30:00.000Z")).toEqual({ isOpen: true });
    expect(await sessions.expirationFor(MVP_SECURITIES[0]!.id, "2026-09-12T16:30:00.000Z", "DAY"))
      .toBe("2026-09-13T16:30:00.000Z");
  });
});
