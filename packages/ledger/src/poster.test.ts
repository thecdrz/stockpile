import { Money } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import { InMemoryLedgerAccountCatalog } from "./account.js";
import { LedgerPoster } from "./poster.js";
import { InMemoryLedgerStore } from "./store.js";
import type {
  CorrelationId,
  EnvironmentId,
  FinancialEventId,
  JournalEntryId,
  LedgerAccountId,
} from "./types.js";

const environmentId = "environment:test" as EnvironmentId;
const playerCashId = "account:player:cash" as LedgerAccountId;
const systemEquityId = "account:system:equity" as LedgerAccountId;
const leagueCashId = "account:league:cash" as LedgerAccountId;

function createPoster() {
  let eventSequence = 0;
  let entrySequence = 0;
  const store = new InMemoryLedgerStore();
  const accounts = new InMemoryLedgerAccountCatalog([
    { id: playerCashId, environmentId, scope: "CAREER", kind: "PLAYER_CASH", ownerId: "player:1" },
    { id: systemEquityId, environmentId, scope: "CAREER", kind: "SYSTEM_EQUITY" },
    { id: leagueCashId, environmentId, scope: "LEAGUE", kind: "PLAYER_CASH", ownerId: "player:1" },
  ]);
  const poster = new LedgerPoster({
    accounts,
    store,
    now: () => "2026-09-12T12:00:00.000Z",
    nextEventId: () => `event:${++eventSequence}` as FinancialEventId,
    nextEntryId: () => `entry:${++entrySequence}` as JournalEntryId,
  });
  return { poster, store };
}

const draft = {
  environmentId,
  scope: "CAREER" as const,
  eventType: "ACCOUNT_OPENING_GRANT",
  businessEffectiveAt: "2026-09-12T12:00:00.000Z",
  sourceType: "SYSTEM",
  sourceId: "account-opening:player:1",
  idempotencyKey: "account-opening:player:1:career",
  correlationId: "correlation:1" as CorrelationId,
  economyRulesetVersion: "1",
  metadata: { reason: "initial grant" },
};

describe("LedgerPoster", () => {
  it("posts a balanced, immutable account-opening event", async () => {
    const { poster } = createPoster();
    const posted = await poster.post(draft, [
      { ledgerAccountId: playerCashId, direction: "DEBIT", amount: Money.of("100000", "CAD") },
      { ledgerAccountId: systemEquityId, direction: "CREDIT", amount: Money.of("100000", "CAD") },
    ]);

    expect(posted.event.status).toBe("POSTED");
    expect(posted.entries).toHaveLength(2);
    expect(Object.isFrozen(posted.event)).toBe(true);
    expect(Object.isFrozen(posted.event.metadata)).toBe(true);
    expect(Object.isFrozen(posted.entries)).toBe(true);
    expect(Object.isFrozen(posted.entries[0]?.amount)).toBe(true);
  });

  it("returns the original result for an idempotent retry", async () => {
    const { poster } = createPoster();
    const lines = [
      { ledgerAccountId: playerCashId, direction: "DEBIT" as const, amount: Money.of("100000", "CAD") },
      { ledgerAccountId: systemEquityId, direction: "CREDIT" as const, amount: Money.of("100000", "CAD") },
    ];
    const first = await poster.post(draft, lines);
    const retry = await poster.post(draft, lines);
    expect(retry).toBe(first);
  });

  it("rejects an unbalanced event", async () => {
    const { poster } = createPoster();
    await expect(
      poster.post(draft, [
        { ledgerAccountId: playerCashId, direction: "DEBIT", amount: Money.of("100000", "CAD") },
        { ledgerAccountId: systemEquityId, direction: "CREDIT", amount: Money.of("99999", "CAD") },
      ]),
    ).rejects.toThrow("Unbalanced journal for CAD");
  });

  it("balances every currency independently", async () => {
    const { poster } = createPoster();
    await expect(
      poster.post(draft, [
        { ledgerAccountId: playerCashId, direction: "DEBIT", amount: Money.of("1", "CAD") },
        { ledgerAccountId: systemEquityId, direction: "CREDIT", amount: Money.of("1", "CAD") },
        { ledgerAccountId: playerCashId, direction: "DEBIT", amount: Money.of("1", "USD") },
        { ledgerAccountId: systemEquityId, direction: "CREDIT", amount: Money.of("2", "USD") },
      ]),
    ).rejects.toThrow("Unbalanced journal for USD");
  });

  it("rejects account leakage between Career and League", async () => {
    const { poster } = createPoster();
    await expect(
      poster.post(draft, [
        { ledgerAccountId: leagueCashId, direction: "DEBIT", amount: Money.of("1", "CAD") },
        { ledgerAccountId: systemEquityId, direction: "CREDIT", amount: Money.of("1", "CAD") },
      ]),
    ).rejects.toThrow("Ledger account scope mismatch");
  });

  it("rejects zero and negative journal amounts", async () => {
    const { poster } = createPoster();
    await expect(
      poster.post(draft, [
        { ledgerAccountId: playerCashId, direction: "DEBIT", amount: Money.zero("CAD") },
        { ledgerAccountId: systemEquityId, direction: "CREDIT", amount: Money.zero("CAD") },
      ]),
    ).rejects.toThrow("Journal amounts must be positive");
  });
});
