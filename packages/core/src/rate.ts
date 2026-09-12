import { Decimal } from "decimal.js";
import { DecimalValue } from "./decimal-value.js";

export class Rate extends DecimalValue {
  private constructor(value: string | Decimal) {
    super(value, 12);
    if (this.isNegative()) throw new RangeError("Rate cannot be negative");
    Object.freeze(this);
  }

  static of(value: string): Rate {
    return new Rate(value);
  }

  complement(): Rate {
    const complement = new Decimal(1).minus(this.toString());
    if (complement.isNegative()) throw new RangeError("Rate cannot exceed one when taking its complement");
    return new Rate(complement);
  }
}
