import { describe, expect, it } from "vitest";
import { Money, Price, Quantity, QuantityDelta, Rate } from "./index.js";

describe("exact financial value objects", () => {
  it("adds money without floating-point drift", () => {
    expect(Money.of("0.1", "CAD").add(Money.of("0.2", "CAD")).toString()).toBe("0.30000000");
  });

  it("rejects cross-currency arithmetic", () => {
    expect(() => Money.of("1", "CAD").add(Money.of("1", "USD"))).toThrow("Currency mismatch");
  });

  it("rejects values beyond their supported scale", () => {
    expect(() => Money.of("0.000000001", "CAD")).toThrow("exceeds scale 8");
  });

  it("enforces domain signs", () => {
    expect(() => Price.of("0", "CAD")).toThrow("Price must be positive");
    expect(() => Quantity.of("-1")).toThrow("Quantity cannot be negative");
    expect(() => Rate.of("-0.01")).toThrow("Rate cannot be negative");
  });

  it("keeps owned quantities non-negative while allowing signed ledger deltas", () => {
    expect(Quantity.of("2.5").add(QuantityDelta.of("-0.5")).toString()).toBe("2.000000000000");
    expect(() => Quantity.of("0.25").add(QuantityDelta.of("-0.5"))).toThrow("Quantity cannot be negative");
  });

  it("calculates an affordable fractional quantity without exceeding cash", () => {
    const price = Price.of("3", "CAD");
    const quantity = price.maximumAffordableQuantity(Money.of("10", "CAD"));
    expect(quantity.toString()).toBe("3.333333333333");
    expect(price.notional(quantity).compare(Money.of("10", "CAD"))).toBeLessThanOrEqual(0);
  });
});
