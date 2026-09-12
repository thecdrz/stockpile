import { QuantityDelta } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import { rebuildPositionQuantities } from "./position-projection.js";
import type { SecurityQuantityEntry, PositionAccountId, SecurityEntryId, SecurityId } from "./quantity-entry.js";
import type { EnvironmentId, FinancialEventId } from "./types.js";

const environmentId = "environment:test" as EnvironmentId;
const positionAccountId = "position:career:player-1" as PositionAccountId;
const securityId = "security:northstar" as SecurityId;

function entry(id: string, delta: string): SecurityQuantityEntry {
  return Object.freeze({
    id: id as SecurityEntryId,
    financialEventId: `event:${id}` as FinancialEventId,
    environmentId,
    scope: "CAREER",
    positionAccountId,
    securityId,
    quantityDelta: QuantityDelta.of(delta),
    effectiveAt: "2026-09-12T12:00:00.000Z",
    entryType: delta.startsWith("-") ? "TRADE_SELL" : "TRADE_BUY",
  });
}

describe("rebuildPositionQuantities", () => {
  it("rebuilds fractional positions from immutable deltas", () => {
    const positions = rebuildPositionQuantities([entry("1", "10.125"), entry("2", "-2.025")]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.quantity.toString()).toBe("8.100000000000");
    expect(Object.isFrozen(positions)).toBe(true);
    expect(Object.isFrozen(positions[0])).toBe(true);
  });

  it("keeps economic scopes isolated", () => {
    const leagueEntry = { ...entry("2", "5"), scope: "LEAGUE" as const };
    const positions = rebuildPositionQuantities([entry("1", "10"), leagueEntry]);
    expect(positions.map((position) => [position.scope, position.quantity.toString()])).toEqual([
      ["CAREER", "10.000000000000"],
      ["LEAGUE", "5.000000000000"],
    ]);
  });

  it("rejects a rebuilt negative owned quantity", () => {
    expect(() => rebuildPositionQuantities([entry("1", "-0.000000000001")])).toThrow(
      "Negative position quantity",
    );
  });
});
