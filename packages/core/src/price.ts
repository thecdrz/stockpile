import { Decimal } from "decimal.js";
import { DecimalValue } from "./decimal-value.js";
import type { Currency } from "./money.js";
import { Money } from "./money.js";
import { Quantity } from "./quantity.js";

export class Price extends DecimalValue {
  private constructor(value: string | Decimal, readonly currency: Currency) {
    super(value, 10);
    if (this.isNegative() || this.isZero()) throw new RangeError("Price must be positive");
    Object.freeze(this);
  }

  static of(value: string, currency: Currency): Price {
    return new Price(value, currency);
  }

  notional(quantity: Quantity): Money {
    const amount = this.decimal().times(quantity.toString()).toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
    return Money.of(amount.toFixed(8), this.currency);
  }

  maximumAffordableQuantity(cash: Money): Quantity {
    if (cash.currency !== this.currency) throw new TypeError("Price and cash currency mismatch");
    if (cash.isNegative()) throw new RangeError("Available cash cannot be negative");
    const quantity = new Decimal(cash.toString()).dividedBy(this.decimal()).toDecimalPlaces(12, Decimal.ROUND_DOWN);
    return Quantity.of(quantity.toFixed(12));
  }

  compare(other: Price): number {
    if (other.currency !== this.currency) throw new TypeError("Price currency mismatch");
    return this.decimal().comparedTo(other.decimal());
  }
}
