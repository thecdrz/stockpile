export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type EnvironmentId = Brand<string, "EnvironmentId">;
export type LedgerAccountId = Brand<string, "LedgerAccountId">;
export type FinancialEventId = Brand<string, "FinancialEventId">;
export type JournalEntryId = Brand<string, "JournalEntryId">;
export type CorrelationId = Brand<string, "CorrelationId">;

export type EconomicScope = "CAREER" | "LEAGUE" | "SYSTEM";
export type JournalDirection = "DEBIT" | "CREDIT";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };
