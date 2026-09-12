import { Money, Quantity } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import {
  addReorganizationPosition, allocateSpinoffBasis, applyBuy, applySell, applySplit,
  emptyPositionCostBasis, removeForReorganization, weightedAverageCost,
  settleReorganization,
} from "./cost-basis.js";

describe("weighted-average cost basis", () => {
  it("combines repeated buys using aggregate cost", () => {
    let position = emptyPositionCostBasis("CAD");
    position = applyBuy(position, Quantity.of("10"), Money.of("100", "CAD"));
    position = applyBuy(position, Quantity.of("10"), Money.of("300", "CAD"));

    expect(position.quantity.toString()).toBe("20.000000000000");
    expect(position.remainingCost.toString()).toBe("400.00000000");
    expect(weightedAverageCost(position)?.toString()).toBe("20.0000000000");
  });

  it("removes average cost and records realized gain on a partial sale", () => {
    const position = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("20"), Money.of("400", "CAD"));
    const sale = applySell(position, Quantity.of("5"), Money.of("125", "CAD"));

    expect(sale.costRemoved.toString()).toBe("100.00000000");
    expect(sale.realizedGainLoss.toString()).toBe("25.00000000");
    expect(sale.position.quantity.toString()).toBe("15.000000000000");
    expect(sale.position.remainingCost.toString()).toBe("300.00000000");
    expect(sale.position.realizedGainLoss.toString()).toBe("25.00000000");
  });

  it("uses round-half-to-even for proportional cost allocation", () => {
    const position = applyBuy(emptyPositionCostBasis("USD"), Quantity.of("3"), Money.of("1", "USD"));
    const sale = applySell(position, Quantity.of("1"), Money.of("0.5", "USD"));
    expect(sale.costRemoved.toString()).toBe("0.33333333");
    expect(sale.position.remainingCost.toString()).toBe("0.66666667");
  });

  it("removes all residual cost exactly on the final sale", () => {
    let position = applyBuy(emptyPositionCostBasis("USD"), Quantity.of("3"), Money.of("1", "USD"));
    position = applySell(position, Quantity.of("1"), Money.of("0.5", "USD")).position;
    const finalSale = applySell(position, Quantity.of("2"), Money.of("1", "USD"));
    expect(finalSale.costRemoved.toString()).toBe("0.66666667");
    expect(finalSale.position.remainingCost.toString()).toBe("0.00000000");
    expect(finalSale.position.quantity.toString()).toBe("0.000000000000");
  });

  it("rejects overselling and currency mismatch", () => {
    const position = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("1"), Money.of("10", "CAD"));
    expect(() => applySell(position, Quantity.of("2"), Money.of("20", "CAD"))).toThrow("owned quantity");
    expect(() => applySell(position, Quantity.of("1"), Money.of("20", "USD"))).toThrow("currency mismatch");
  });
});

describe("split cost basis", () => {
  it("changes exact fractional quantity while preserving aggregate cost", () => {
    const before = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("3"), Money.of("120", "CAD"));
    const result = applySplit(before, "1.5");
    expect(result.position.quantity.toString()).toBe("4.500000000000");
    expect(result.quantityDelta.toString()).toBe("1.500000000000");
    expect(result.position.remainingCost).toBe(before.remainingCost);
    expect(weightedAverageCost(result.position)?.toString()).toBe("26.6666666667");
  });

  it("supports reverse splits without cashing out fractional shares", () => {
    const before = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("1"), Money.of("10", "CAD"));
    const result = applySplit(before, "0.1");
    expect(result.position.quantity.toString()).toBe("0.100000000000");
    expect(result.quantityDelta.toString()).toBe("-0.900000000000");
    expect(result.position.remainingCost.toString()).toBe("10.00000000");
  });
});

describe("corporate reorganization cost basis", () => {
  it("transfers all basis in a stock merger without realizing a gain", () => {
    const oldPosition = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("10"), Money.of("250", "CAD"));
    const removed = removeForReorganization(oldPosition);
    const replacement = addReorganizationPosition(emptyPositionCostBasis("CAD"), Quantity.of("5"), removed.transferredCost);
    expect(removed.position.quantity.isZero()).toBe(true);
    expect(removed.position.realizedGainLoss.toString()).toBe("0.00000000");
    expect(replacement.remainingCost.toString()).toBe("250.00000000");
    expect(weightedAverageCost(replacement)?.toString()).toBe("50.0000000000");
  });

  it("allocates spin-off basis exactly while retaining the parent quantity", () => {
    const parent = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("10"), Money.of("100", "CAD"));
    const allocation = allocateSpinoffBasis(parent, "0.25");
    const child = addReorganizationPosition(emptyPositionCostBasis("CAD"), Quantity.of("2"), allocation.childCost);
    expect(allocation.parent.quantity.toString()).toBe("10.000000000000");
    expect(allocation.parent.remainingCost.toString()).toBe("75.00000000");
    expect(child.remainingCost.toString()).toBe("25.00000000");
  });

  it("realizes only the cash-allocated basis in a mixed merger", () => {
    const oldPosition = applyBuy(emptyPositionCostBasis("CAD"), Quantity.of("10"), Money.of("100", "CAD"));
    const settled = settleReorganization(oldPosition, Money.of("60", "CAD"), "0.4");
    expect(settled.transferredCost.toString()).toBe("40.00000000");
    expect(settled.cashBasis.toString()).toBe("60.00000000");
    expect(settled.realizedGainLoss.toString()).toBe("0.00000000");
    expect(settled.oldPosition.quantity.isZero()).toBe(true);
  });
});
