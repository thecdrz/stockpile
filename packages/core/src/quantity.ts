import { Decimal } from "decimal.js";
import { DecimalValue } from "./decimal-value.js";
import type { QuantityDelta } from "./quantity-delta.js";

export class Quantity extends DecimalValue {
  private constructor(value: string | Decimal) {
    super(value, 12);
    if (this.isNegative()) throw new RangeError("Quantity cannot be negative");
    Object.freeze(this);
  }

  static of(value: string): Quantity {
    return new Quantity(value);
  }

  static zero(): Quantity {
    return new Quantity("0");
  }

  add(delta: QuantityDelta): Quantity {
    return new Quantity(new Decimal(this.toString()).plus(delta.toString()));
  }

  compare(other: Quantity): number {
    return new Decimal(this.toString()).comparedTo(other.toString());
  }
}
