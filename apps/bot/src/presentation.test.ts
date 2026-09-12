import { describe, expect, it } from "vitest";
import { formatDiscordTime, formatMoney, formatQuantity, transactionLabel } from "./presentation.js";

describe("Discord presentation", () => {
  it("formats exact accounting values for people", () => {
    expect(formatMoney("100000.00000000", "CAD")).toBe("$100,000.00 CAD");
    expect(formatMoney("-524.215000", "CAD", true)).toBe("−$524.21 CAD");
    expect(formatMoney("15", "USD", true)).toBe("+$15.00 USD");
  });
  it("removes irrelevant quantity zeroes", () => {
    expect(formatQuantity("20.000000000000")).toBe("20");
    expect(formatQuantity("2.500000000000")).toBe("2.5");
  });
  it("uses Discord-native time and friendly event labels", () => {
    expect(formatDiscordTime("2026-09-12T17:00:00.000Z")).toBe("<t:1789232400:R>");
    expect(transactionLabel("SECURITY_BUY")).toBe("Stock purchase");
  });
});
