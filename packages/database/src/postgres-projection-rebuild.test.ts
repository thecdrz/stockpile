import { describe, expect, it } from "vitest";
import { rebuildCostBasis, type CostBasisHistoryRow } from "./postgres-projection-rebuild.js";

const identity = { positionAccountId: "position:1", securityId: "security:1", baseCurrency: "CAD" as const };

describe("rebuildCostBasis", () => {
  it("replays buys, sales, and splits from immutable history", () => {
    const rows: CostBasisHistoryRow[] = [
      { ...identity, entryType: "TRADE_BUY", quantityDelta: "4", buyCost: "100", sellProceeds: null, metadata: {} },
      { ...identity, entryType: "SPLIT", quantityDelta: "4", buyCost: null, sellProceeds: null, metadata: { ratio: "2" } },
      { ...identity, entryType: "TRADE_SELL", quantityDelta: "-2", buyCost: null, sellProceeds: "40", metadata: {} },
    ];
    const rebuilt = rebuildCostBasis(rows)[0]?.position;
    expect(rebuilt?.quantity.toString()).toBe("6.000000000000");
    expect(rebuilt?.remainingCost.toString()).toBe("75.00000000");
    expect(rebuilt?.realizedGainLoss.toString()).toBe("15.00000000");
  });

  it("rejects split history whose recorded delta disagrees with the ratio", () => {
    expect(() => rebuildCostBasis([
      { ...identity, entryType: "TRADE_BUY", quantityDelta: "4", buyCost: "100", sellProceeds: null, metadata: {} },
      { ...identity, entryType: "SPLIT", quantityDelta: "3", buyCost: null, sellProceeds: null, metadata: { ratio: "2" } },
    ])).toThrow("does not match");
  });
});
