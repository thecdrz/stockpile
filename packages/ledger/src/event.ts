import type { Money } from "@stockpile/core";
import type {
  CorrelationId,
  EconomicScope,
  EnvironmentId,
  FinancialEventId,
  JournalDirection,
  JournalEntryId,
  JsonObject,
  LedgerAccountId,
} from "./types.js";

export type FinancialEventStatus = "POSTED";

export interface FinancialEventDraft {
  readonly environmentId: EnvironmentId;
  readonly scope: EconomicScope;
  readonly eventType: string;
  readonly businessEffectiveAt: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
  readonly economyRulesetVersion: string;
  readonly marketDataReference?: string;
  readonly initiatingDiscordUserId?: string;
  readonly metadata?: JsonObject;
}

export interface JournalLineDraft {
  readonly ledgerAccountId: LedgerAccountId;
  readonly direction: JournalDirection;
  readonly amount: Money;
  readonly metadata?: JsonObject;
}

export interface FinancialEvent extends FinancialEventDraft {
  readonly id: FinancialEventId;
  readonly status: FinancialEventStatus;
  readonly createdAt: string;
  readonly postedAt: string;
  readonly reversesEventId?: FinancialEventId;
}

export interface JournalEntry extends JournalLineDraft {
  readonly id: JournalEntryId;
  readonly financialEventId: FinancialEventId;
  readonly createdAt: string;
}

export interface PostedFinancialEvent {
  readonly event: FinancialEvent;
  readonly entries: readonly JournalEntry[];
}
