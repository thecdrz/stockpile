import { describe, expect, it } from "vitest";
import { Money, Price, Rate, convertForeignTrade, maximumAffordableForeignQuantity } from "./index.js";

describe("foreign trade conversion", () => {
  const fx = Rate.of("1.36");
  const spread = Rate.of("0.002");

  it("adds the configured spread to a foreign buy", () => {
    const conversion = convertForeignTrade(Money.of("100", "USD"), "CAD", fx, spread, "BUY");
    expect(conversion.grossBaseAmount.toString()).toBe("136.00000000");
    expect(conversion.spreadAmount.toString()).toBe("0.27200000");
    expect(conversion.playerCashEffect.toString()).toBe("136.27200000");
  });

  it("subtracts the configured spread from a foreign sale", () => {
    const conversion = convertForeignTrade(Money.of("100", "USD"), "CAD", fx, spread, "SELL");
    expect(conversion.playerCashEffect.toString()).toBe("135.72800000");
  });

  it("floors foreign quantity to available base cash", () => {
    const quantity = maximumAffordableForeignQuantity(
      Money.of("136.272", "CAD"),
      Price.of("100", "USD"),
      fx,
      spread,
    );
    expect(quantity.toString()).toBe("1.000000000000");
  });
});
