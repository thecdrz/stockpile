import type { Money } from "./money.js";
import type { Quantity } from "./quantity.js";
import { QuantityDelta } from "./quantity-delta.js";

export interface CashAvailability {
  readonly totalCash: Money;
  readonly reservedCash: Money;
}

export interface ShareAvailability {
  readonly ownedQuantity: Quantity;
  readonly reservedQuantity: Quantity;
}

export function availableCash(state: CashAvailability): Money {
  return state.totalCash.subtract(state.reservedCash);
}

export function availableShares(state: ShareAvailability): Quantity {
  return state.ownedQuantity.add(QuantityDelta.of(`-${state.reservedQuantity.toString()}`));
}

export function assertCanReserveCash(state: CashAvailability, requested: Money): void {
  if (requested.isNegative() || requested.isZero()) throw new Error("Cash reservation must be positive");
  if (availableCash(state).compare(requested) < 0) throw new Error("Insufficient available cash");
}

export function assertCanReserveShares(state: ShareAvailability, requested: Quantity): void {
  if (requested.isZero()) throw new Error("Share reservation must be positive");
  if (availableShares(state).compare(requested) < 0) throw new Error("Insufficient available shares");
}
