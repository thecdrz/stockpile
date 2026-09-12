import { Decimal } from "decimal.js";

export type DecimalScale = 8 | 10 | 12;

export abstract class DecimalValue {
  readonly #value: Decimal;

  protected constructor(value: string | Decimal, readonly scale: DecimalScale) {
    const parsed = value instanceof Decimal ? value : new Decimal(value);
    if (!parsed.isFinite()) throw new RangeError("Decimal value must be finite");
    if (parsed.decimalPlaces() > scale) {
      throw new RangeError(`Decimal value exceeds scale ${scale}`);
    }
    this.#value = parsed;
  }

  protected decimal(): Decimal {
    return this.#value;
  }

  equals(other: DecimalValue): boolean {
    return this.#value.equals(other.#value);
  }

  isNegative(): boolean {
    return this.#value.isNegative();
  }

  isZero(): boolean {
    return this.#value.isZero();
  }

  toString(): string {
    return this.#value.toFixed(this.scale);
  }

  toJSON(): string {
    return this.toString();
  }
}
