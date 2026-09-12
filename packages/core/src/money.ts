import { Decimal } from "decimal.js";
import { DecimalValue } from "./decimal-value.js";

export type Currency = "CAD" | "USD";

export class Money extends DecimalValue {
  private constructor(value: string | Decimal, readonly currency: Currency) {
    super(value, 8);
    Object.freeze(this);
  }

  static of(value: string, currency: Currency): Money {
    return new Money(value, currency);
  }

  static zero(currency: Currency): Money {
    return new Money("0", currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.decimal().plus(other.decimal()), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.decimal().minus(other.decimal()), this.currency);
  }

  compare(other: Money): number {
    this.assertSameCurrency(other);
    return this.decimal().comparedTo(other.decimal());
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(`Currency mismatch: ${this.currency} and ${other.currency}`);
    }
  }
}
