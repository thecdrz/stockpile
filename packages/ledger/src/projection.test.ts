import { Money } from "@stockpile/core";
import { describe, expect, it } from "vitest";
import { rebuildLedgerBalances } from "./projection.js";
import type { PostedFinancialEvent } from "./event.js";
import type { EnvironmentId, FinancialEventId, JournalEntryId, LedgerAccountId } from "./types.js";

const playerCashId = "account:player:cash" as LedgerAccountId;
const systemEquityId = "account:system:equity" as LedgerAccountId;
const eventId = "event:1" as FinancialEventId;

const posted: PostedFinancialEvent = {
  event: {
    id: eventId,
    environmentId: "environment:test" as EnvironmentId,
    scope: "CAREER",
    eventType: "ACCOUNT_OPENING_GRANT",
    status: "POSTED",
    businessEffectiveAt: "2026-09-12T12:00:00.000Z",
    createdAt: "2026-09-12T12:00:00.000Z",
    postedAt: "2026-09-12T12:00:00.000Z",
    sourceType: "SYSTEM",
    sourceId: "account-opening:player:1",
    idempotencyKey: "account-opening:player:1:career",
    correlationId: "correlation:1" as never,
    economyRulesetVersion: "1",
  },
  entries: [
    {
      id: "entry:1" as JournalEntryId,
      financialEventId: eventId,
      ledgerAccountId: playerCashId,
      direction: "DEBIT",
      amount: Money.of("100000", "CAD"),
      createdAt: "2026-09-12T12:00:00.000Z",
    },
    {
      id: "entry:2" as JournalEntryId,
      financialEventId: eventId,
      ledgerAccountId: systemEquityId,
      direction: "CREDIT",
      amount: Money.of("100000", "CAD"),
      createdAt: "2026-09-12T12:00:00.000Z",
    },
  ],
};

describe("rebuildLedgerBalances", () => {
  it("rebuilds exact debit balances solely from posted entries", () => {
    const balances = rebuildLedgerBalances([posted]);
    expect(balances).toEqual([
      { ledgerAccountId: playerCashId, currency: "CAD", debitBalance: Money.of("100000", "CAD") },
      { ledgerAccountId: systemEquityId, currency: "CAD", debitBalance: Money.of("-100000", "CAD") },
    ]);
    expect(Object.isFrozen(balances)).toBe(true);
  });
});
