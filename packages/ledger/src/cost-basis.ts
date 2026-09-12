import { Decimal } from "decimal.js";
import { Money, Price, Quantity, QuantityDelta, type Currency } from "@stockpile/core";

export interface PositionCostBasis {
  readonly quantity: Quantity;
  readonly remainingCost: Money;
  readonly realizedGainLoss: Money;
}

export interface SaleCostBasisResult {
  readonly position: PositionCostBasis;
  readonly costRemoved: Money;
  readonly realizedGainLoss: Money;
}

export interface SplitCostBasisResult {
  readonly position: PositionCostBasis;
  readonly quantityDelta: QuantityDelta;
}

export interface BasisRemovalResult {
  readonly position: PositionCostBasis;
  readonly removedQuantity: Quantity;
  readonly transferredCost: Money;
}

export interface SpinoffBasisResult {
  readonly parent: PositionCostBasis;
  readonly childCost: Money;
}

export interface ReorganizationSettlementResult {
  readonly oldPosition: PositionCostBasis;
  readonly transferredCost: Money;
  readonly cashBasis: Money;
  readonly realizedGainLoss: Money;
}

export function emptyPositionCostBasis(currency: Currency): PositionCostBasis {
  return freezePosition({
    quantity: Quantity.zero(),
    remainingCost: Money.zero(currency),
    realizedGainLoss: Money.zero(currency),
  });
}

export function applyBuy(
  position: PositionCostBasis,
  acquiredQuantity: Quantity,
  executedBaseCost: Money,
): PositionCostBasis {
  assertCurrency(position, executedBaseCost);
  if (acquiredQuantity.isZero()) throw new Error("Buy quantity must be positive");
  if (executedBaseCost.isNegative() || executedBaseCost.isZero()) throw new Error("Buy cost must be positive");

  return freezePosition({
    quantity: position.quantity.add(QuantityDelta.of(acquiredQuantity.toString())),
    remainingCost: position.remainingCost.add(executedBaseCost),
    realizedGainLoss: position.realizedGainLoss,
  });
}

export function applySell(
  position: PositionCostBasis,
  soldQuantity: Quantity,
  netBaseProceeds: Money,
): SaleCostBasisResult {
  assertCurrency(position, netBaseProceeds);
  if (soldQuantity.isZero()) throw new Error("Sell quantity must be positive");
  if (netBaseProceeds.isNegative()) throw new Error("Sale proceeds cannot be negative");

  const owned = new Decimal(position.quantity.toString());
  const sold = new Decimal(soldQuantity.toString());
  if (sold.greaterThan(owned)) throw new Error("Cannot sell more than the owned quantity");

  const costRemoved = sold.equals(owned)
    ? position.remainingCost
    : allocateCost(position.remainingCost, sold, owned);
  const gainLoss = netBaseProceeds.subtract(costRemoved);
  const updated = freezePosition({
    quantity: position.quantity.add(QuantityDelta.of(sold.negated().toFixed(12))),
    remainingCost: position.remainingCost.subtract(costRemoved),
    realizedGainLoss: position.realizedGainLoss.add(gainLoss),
  });

  return Object.freeze({ position: updated, costRemoved, realizedGainLoss: gainLoss });
}

/** Applies a pure split without changing aggregate cost or realized gain/loss. */
export function applySplit(position: PositionCostBasis, ratio: string): SplitCostBasisResult {
  const parsedRatio = new Decimal(ratio);
  if (!parsedRatio.isFinite() || parsedRatio.lessThanOrEqualTo(0)) throw new Error("Split ratio must be positive");
  if (position.quantity.isZero()) {
    return Object.freeze({ position, quantityDelta: QuantityDelta.zero() });
  }
  const oldQuantity = new Decimal(position.quantity.toString());
  const newQuantity = oldQuantity.times(parsedRatio).toDecimalPlaces(12, Decimal.ROUND_HALF_EVEN);
  if (newQuantity.lessThanOrEqualTo(0)) throw new Error("Split quantity is below supported precision");
  const quantityDelta = QuantityDelta.of(newQuantity.minus(oldQuantity).toFixed(12));
  return Object.freeze({
    position: freezePosition({
      quantity: Quantity.of(newQuantity.toFixed(12)),
      remainingCost: position.remainingCost,
      realizedGainLoss: position.realizedGainLoss,
    }),
    quantityDelta,
  });
}

/** Removes an acquired/reorganized security while transferring, not realizing, its basis. */
export function removeForReorganization(position: PositionCostBasis): BasisRemovalResult {
  if (position.quantity.isZero()) throw new Error("Reorganization requires a position");
  return Object.freeze({
    position: freezePosition({
      quantity: Quantity.zero(),
      remainingCost: Money.zero(position.remainingCost.currency),
      realizedGainLoss: position.realizedGainLoss,
    }),
    removedQuantity: position.quantity,
    transferredCost: position.remainingCost,
  });
}

/** Adds stock consideration with transferred basis and no realized gain/loss. */
export function addReorganizationPosition(
  position: PositionCostBasis,
  quantity: Quantity,
  transferredCost: Money,
): PositionCostBasis {
  assertCurrency(position, transferredCost);
  if (quantity.isZero()) throw new Error("Reorganization quantity must be positive");
  if (transferredCost.isNegative()) throw new Error("Transferred basis cannot be negative");
  return freezePosition({
    quantity: position.quantity.add(QuantityDelta.of(quantity.toString())),
    remainingCost: position.remainingCost.add(transferredCost),
    realizedGainLoss: position.realizedGainLoss,
  });
}

/** Allocates a versioned percentage of parent basis to a spin-off child. */
export function allocateSpinoffBasis(position: PositionCostBasis, childBasisPercentage: string): SpinoffBasisResult {
  const percentage = new Decimal(childBasisPercentage);
  if (!percentage.isFinite() || percentage.isNegative() || percentage.greaterThan(1)) {
    throw new Error("Child basis percentage must be between zero and one");
  }
  const childCost = Money.of(
    new Decimal(position.remainingCost.toString()).times(percentage).toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN).toFixed(8),
    position.remainingCost.currency,
  );
  return Object.freeze({
    parent: freezePosition({
      quantity: position.quantity,
      remainingCost: position.remainingCost.subtract(childCost),
      realizedGainLoss: position.realizedGainLoss,
    }),
    childCost,
  });
}

/**
 * Removes an old security and deterministically divides its basis between cash
 * consideration and replacement stock. Mixed actions require a provider-backed
 * allocation; pure cash uses zero and pure stock uses one.
 */
export function settleReorganization(
  position: PositionCostBasis,
  cashProceeds: Money,
  stockBasisPercentage: string,
): ReorganizationSettlementResult {
  assertCurrency(position, cashProceeds);
  if (cashProceeds.isNegative()) throw new Error("Reorganization proceeds cannot be negative");
  const allocation = allocateSpinoffBasis(position, stockBasisPercentage);
  const cashBasis = allocation.parent.remainingCost;
  const realizedGainLoss = cashProceeds.subtract(cashBasis);
  return Object.freeze({
    oldPosition: freezePosition({
      quantity: Quantity.zero(),
      remainingCost: Money.zero(position.remainingCost.currency),
      realizedGainLoss: position.realizedGainLoss.add(realizedGainLoss),
    }),
    transferredCost: allocation.childCost,
    cashBasis,
    realizedGainLoss,
  });
}

export function weightedAverageCost(position: PositionCostBasis): Price | null {
  if (position.quantity.isZero()) return null;
  const average = new Decimal(position.remainingCost.toString())
    .dividedBy(position.quantity.toString())
    .toDecimalPlaces(10, Decimal.ROUND_HALF_EVEN);
  return Price.of(average.toFixed(10), position.remainingCost.currency);
}

function allocateCost(cost: Money, numerator: Decimal, denominator: Decimal): Money {
  const allocated = new Decimal(cost.toString())
    .times(numerator)
    .dividedBy(denominator)
    .toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
  return Money.of(allocated.toFixed(8), cost.currency);
}

function assertCurrency(position: PositionCostBasis, amount: Money): void {
  if (position.remainingCost.currency !== amount.currency || position.realizedGainLoss.currency !== amount.currency) {
    throw new Error("Cost-basis currency mismatch");
  }
}

function freezePosition(position: PositionCostBasis): PositionCostBasis {
  return Object.freeze(position);
}
