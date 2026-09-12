import type { Money, QuantityDelta } from "@stockpile/core";
import type { EconomicScope, EnvironmentId, FinancialEventId, JsonObject } from "./types.js";

export type PositionAccountId = string & { readonly __brand: "PositionAccountId" };
export type SecurityId = string & { readonly __brand: "SecurityId" };
export type SecurityEntryId = string & { readonly __brand: "SecurityEntryId" };

export type SecurityEntryType =
  | "TRADE_BUY"
  | "TRADE_SELL"
  | "SPLIT"
  | "MERGER_OUT"
  | "MERGER_IN"
  | "SPINOFF_IN"
  | "BANKRUPTCY_LIQUIDATION"
  | "CORRECTION";

export interface SecurityQuantityEntry {
  readonly id: SecurityEntryId;
  readonly financialEventId: FinancialEventId;
  readonly environmentId: EnvironmentId;
  readonly scope: EconomicScope;
  readonly positionAccountId: PositionAccountId;
  readonly securityId: SecurityId;
  readonly quantityDelta: QuantityDelta;
  readonly unitCostInBaseCurrency?: Money;
  readonly effectiveAt: string;
  readonly entryType: SecurityEntryType;
  readonly metadata?: JsonObject;
}
