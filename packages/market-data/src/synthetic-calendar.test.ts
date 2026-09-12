import { describe, expect, it } from "vitest";
import type { Security, SecurityId } from "./provider.js";
import { SyntheticExchangeCalendar } from "./synthetic-calendar.js";

const securityId = "security:1" as SecurityId;
const security: Security = { id: securityId, symbol: "ORBT", name: "Orbit", exchange: "SYNTHETIC_CA",
  mic: "XTSE", currency: "CAD", kind: "STOCK" };
const calendar = new SyntheticExchangeCalendar([security], [
  { mic: "XTSE", opensAt: "2026-07-02T13:30:00.000Z", closesAt: "2026-07-02T20:00:00.000Z" },
  // No July 3 session: the holiday exists as absence in the authoritative fixture.
  { mic: "XTSE", opensAt: "2026-07-06T13:30:00.000Z", closesAt: "2026-07-06T17:00:00.000Z", earlyClose: true },
  // Standard-time UTC offset is represented directly instead of hand-coded DST math.
  { mic: "XTSE", opensAt: "2026-11-02T14:30:00.000Z", closesAt: "2026-11-02T21:00:00.000Z" },
]);

describe("SyntheticExchangeCalendar", () => {
  it("queues a holiday order to the next explicit session", async () => {
    await expect(calendar.getSession(securityId, "2026-07-03T15:00:00.000Z")).resolves.toEqual({
      isOpen: false, nextOpenAt: "2026-07-06T13:30:00.000Z",
    });
  });

  it("uses the explicit early close for day-order expiration", async () => {
    await expect(calendar.expirationFor(securityId, "2026-07-06T14:00:00.000Z", "DAY"))
      .resolves.toBe("2026-07-06T17:00:00.000Z");
    expect(calendar.status(securityId, "2026-07-06T17:00:00.000Z")).toBe("EARLY_CLOSED");
  });

  it("derives dividend entitlement from the explicit preceding session close", async () => {
    await expect(calendar.priorSessionClose(securityId, "2026-07-06"))
      .resolves.toBe("2026-07-02T20:00:00.000Z");
  });

  it("fails closed when no authoritative future session is present", async () => {
    await expect(calendar.getSession(securityId, "2026-11-03T15:00:00.000Z"))
      .rejects.toThrow("future market session is unavailable");
  });
});
