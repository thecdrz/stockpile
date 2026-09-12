import { Quantity, QuantityDelta } from "@stockpile/core";
import type { SecurityQuantityEntry } from "./quantity-entry.js";
import type { EconomicScope, EnvironmentId } from "./types.js";
import type { PositionAccountId, SecurityId } from "./quantity-entry.js";

export interface PositionQuantity {
  readonly environmentId: EnvironmentId;
  readonly scope: EconomicScope;
  readonly positionAccountId: PositionAccountId;
  readonly securityId: SecurityId;
  readonly quantity: Quantity;
}

export function rebuildPositionQuantities(entries: readonly SecurityQuantityEntry[]): readonly PositionQuantity[] {
  const totals = new Map<string, Omit<PositionQuantity, "quantity"> & { delta: QuantityDelta }>();

  for (const entry of entries) {
    const key = [entry.environmentId, entry.scope, entry.positionAccountId, entry.securityId].join("\u0000");
    const current = totals.get(key);
    totals.set(key, {
      environmentId: entry.environmentId,
      scope: entry.scope,
      positionAccountId: entry.positionAccountId,
      securityId: entry.securityId,
      delta: (current?.delta ?? QuantityDelta.zero()).add(entry.quantityDelta),
    });
  }

  const positions = [...totals.values()].map(({ delta, ...identity }) => {
    let quantity: Quantity;
    try {
      quantity = Quantity.zero().add(delta);
    } catch {
      throw new Error(`Negative position quantity for ${identity.positionAccountId}/${identity.securityId}`);
    }
    return Object.freeze({ ...identity, quantity });
  });

  return Object.freeze(
    positions.sort((left, right) =>
      `${left.environmentId}:${left.scope}:${left.positionAccountId}:${left.securityId}`.localeCompare(
        `${right.environmentId}:${right.scope}:${right.positionAccountId}:${right.securityId}`,
      ),
    ),
  );
}
