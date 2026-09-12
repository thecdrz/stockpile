import { Decimal } from "decimal.js";
import { Money, type Currency } from "./money.js";
import type { Price } from "./price.js";
import { Quantity } from "./quantity.js";
import type { Rate } from "./rate.js";

export interface FxConversion {
  readonly foreignNotional: Money;
  readonly grossBaseAmount: Money;
  readonly spreadAmount: Money;
  readonly playerCashEffect: Money;
  readonly side: "BUY" | "SELL";
}

export function convertForeignTrade(
  foreignNotional: Money,
  baseCurrency: Currency,
  basePerForeignRate: Rate,
  spreadRate: Rate,
  side: "BUY" | "SELL",
): FxConversion {
  if (foreignNotional.currency === baseCurrency) throw new Error("FX conversion requires different currencies");
  if (foreignNotional.isNegative()) throw new Error("Foreign notional cannot be negative");
  if (basePerForeignRate.isZero()) throw new Error("FX rate must be positive");
  if (new Decimal(spreadRate.toString()).greaterThanOrEqualTo(1)) throw new Error("FX spread must be below 100%");

  const gross = new Decimal(foreignNotional.toString())
    .times(basePerForeignRate.toString())
    .toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
  const spread = gross.times(spreadRate.toString()).toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
  const grossBaseAmount = Money.of(gross.toFixed(8), baseCurrency);
  const spreadAmount = Money.of(spread.toFixed(8), baseCurrency);
  const playerCashEffect = side === "BUY" ? grossBaseAmount.add(spreadAmount) : grossBaseAmount.subtract(spreadAmount);
  return Object.freeze({ foreignNotional, grossBaseAmount, spreadAmount, playerCashEffect, side });
}

export function maximumAffordableForeignQuantity(
  availableBaseCash: Money,
  foreignPrice: Price,
  basePerForeignRate: Rate,
  spreadRate: Rate,
): Quantity {
  if (availableBaseCash.currency === foreignPrice.currency) throw new Error("Foreign price must differ from base cash");
  if (new Decimal(spreadRate.toString()).greaterThanOrEqualTo(1)) throw new Error("FX spread must be below 100%");
  const effectiveUnitCost = new Decimal(foreignPrice.toString())
    .times(basePerForeignRate.toString())
    .times(new Decimal(1).plus(spreadRate.toString()));
  if (!effectiveUnitCost.isPositive()) throw new Error("Effective foreign unit cost must be positive");
  const quantity = new Decimal(availableBaseCash.toString())
    .dividedBy(effectiveUnitCost)
    .toDecimalPlaces(12, Decimal.ROUND_DOWN);
  return Quantity.of(quantity.toFixed(12));
}
