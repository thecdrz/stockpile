import { Money, type Currency } from "@stockpile/core";
import type { PostedFinancialEvent } from "./event.js";
import type { LedgerAccountId } from "./types.js";

export interface LedgerBalance {
  readonly ledgerAccountId: LedgerAccountId;
  readonly currency: Currency;
  readonly debitBalance: Money;
}

export function rebuildLedgerBalances(events: readonly PostedFinancialEvent[]): readonly LedgerBalance[] {
  const balances = new Map<string, LedgerBalance>();

  for (const posted of events) {
    for (const entry of posted.entries) {
      const key = `${entry.ledgerAccountId}\u0000${entry.amount.currency}`;
      const current = balances.get(key)?.debitBalance ?? Money.zero(entry.amount.currency);
      const debitBalance =
        entry.direction === "DEBIT" ? current.add(entry.amount) : current.subtract(entry.amount);
      balances.set(
        key,
        Object.freeze({
          ledgerAccountId: entry.ledgerAccountId,
          currency: entry.amount.currency,
          debitBalance,
        }),
      );
    }
  }

  return Object.freeze(
    [...balances.values()].sort((left, right) =>
      `${left.ledgerAccountId}:${left.currency}`.localeCompare(`${right.ledgerAccountId}:${right.currency}`),
    ),
  );
}
