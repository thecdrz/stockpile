import { Money, type Currency } from "@stockpile/core";
import type { LedgerAccountCatalog } from "./account.js";
import type { FinancialEvent, FinancialEventDraft, JournalEntry, JournalLineDraft, PostedFinancialEvent } from "./event.js";
import type { LedgerStore } from "./store.js";
import type { FinancialEventId, JournalEntryId, JsonObject } from "./types.js";

export interface LedgerPosterDependencies {
  readonly accounts: LedgerAccountCatalog;
  readonly store: LedgerStore;
  readonly now: () => string;
  readonly nextEventId: () => FinancialEventId;
  readonly nextEntryId: () => JournalEntryId;
}

export class LedgerPoster {
  constructor(private readonly dependencies: LedgerPosterDependencies) {}

  async post(draft: FinancialEventDraft, lines: readonly JournalLineDraft[]): Promise<PostedFinancialEvent> {
    this.validateDraft(draft, lines);

    const existing = await this.dependencies.store.findByIdempotencyKey(
      draft.environmentId,
      draft.scope,
      draft.idempotencyKey,
    );
    if (existing) return existing;

    await this.validateAccounts(draft, lines);
    this.validateBalance(lines);

    const timestamp = this.dependencies.now();
    const eventId = this.dependencies.nextEventId();
    const { metadata: draftMetadata, ...eventFields } = draft;
    const eventMetadata = cloneJson(draftMetadata);
    const event = this.freezeEvent({
      ...eventFields,
      ...(eventMetadata === undefined ? {} : { metadata: eventMetadata }),
      id: eventId,
      status: "POSTED",
      createdAt: timestamp,
      postedAt: timestamp,
    });
    const entries = lines.map((line) => {
      const { metadata: lineMetadata, ...lineFields } = line;
      const metadata = cloneJson(lineMetadata);
      return Object.freeze({
        ...lineFields,
        ...(metadata === undefined ? {} : { metadata }),
        id: this.dependencies.nextEntryId(),
        financialEventId: eventId,
        createdAt: timestamp,
      }) as JournalEntry;
    });

    return this.dependencies.store.commit(event, entries);
  }

  private validateDraft(draft: FinancialEventDraft, lines: readonly JournalLineDraft[]): void {
    if (draft.idempotencyKey.trim().length === 0) throw new Error("Idempotency key is required");
    if (draft.eventType.trim().length === 0) throw new Error("Event type is required");
    if (Number.isNaN(Date.parse(draft.businessEffectiveAt))) throw new Error("Invalid business effective time");
    if (lines.length < 2) throw new Error("A monetary event requires at least two journal lines");
    for (const line of lines) {
      if (line.amount.isNegative() || line.amount.isZero()) throw new Error("Journal amounts must be positive");
    }
  }

  private async validateAccounts(draft: FinancialEventDraft, lines: readonly JournalLineDraft[]): Promise<void> {
    for (const line of lines) {
      const account = await this.dependencies.accounts.get(line.ledgerAccountId);
      if (!account) throw new Error(`Unknown ledger account: ${line.ledgerAccountId}`);
      if (account.environmentId !== draft.environmentId) throw new Error("Ledger account environment mismatch");
      if (account.scope !== draft.scope) throw new Error("Ledger account scope mismatch");
    }
  }

  private validateBalance(lines: readonly JournalLineDraft[]): void {
    const totals = new Map<Currency, { debit: Money; credit: Money }>();
    for (const line of lines) {
      const currency = line.amount.currency;
      const total = totals.get(currency) ?? { debit: Money.zero(currency), credit: Money.zero(currency) };
      totals.set(currency, {
        debit: line.direction === "DEBIT" ? total.debit.add(line.amount) : total.debit,
        credit: line.direction === "CREDIT" ? total.credit.add(line.amount) : total.credit,
      });
    }
    for (const [currency, total] of totals) {
      if (!total.debit.equals(total.credit)) throw new Error(`Unbalanced journal for ${currency}`);
    }
  }

  private freezeEvent(event: FinancialEvent): FinancialEvent {
    return Object.freeze(event);
  }
}

function cloneJson(value: JsonObject | undefined): JsonObject | undefined {
  if (value === undefined) return undefined;
  return deepFreeze(structuredClone(value));
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
