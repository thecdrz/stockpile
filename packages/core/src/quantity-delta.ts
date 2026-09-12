import { Decimal } from "decimal.js";
import { DecimalValue } from "./decimal-value.js";

export class QuantityDelta extends DecimalValue {
  private constructor(value: string | Decimal) {
    super(value, 12);
    Object.freeze(this);
  }

  static of(value: string): QuantityDelta {
    return new QuantityDelta(value);
  }

  static zero(): QuantityDelta {
    return new QuantityDelta("0");
  }

  add(other: QuantityDelta): QuantityDelta {
    return new QuantityDelta(new Decimal(this.toString()).plus(other.toString()));
  }

  negate(): QuantityDelta {
    return new QuantityDelta(new Decimal(this.toString()).negated());
  }
}
