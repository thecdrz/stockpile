import type { EconomicScope, EnvironmentId, LedgerAccountId } from "./types.js";

export type LedgerAccountKind =
  | "PLAYER_CASH"
  | "PLAYER_RESERVED_CASH"
  | "PLAYER_WAGER_ESCROW"
  | "PLAYER_LOAN_RECEIVABLE"
  | "PLAYER_INTEREST_RECEIVABLE"
  | "PLAYER_SYSTEM_LOAN_PAYABLE"
  | "PLAYER_P2P_LOAN_PAYABLE"
  | "PLAYER_INTEREST_PAYABLE"
  | "PLAYER_MARGIN_PAYABLE"
  | "PLAYER_PRESTIGE_ASSET_VALUE"
  | "PLAYER_SETTLEMENT_DEFICIT"
  | "SYSTEM_EQUITY"
  | "SYSTEM_BANK_CASH"
  | "SYSTEM_INTEREST_INCOME"
  | "SYSTEM_FX_SPREAD_INCOME"
  | "SYSTEM_RECOVERY_GRANT_EXPENSE"
  | "SYSTEM_BANKRUPTCY_WRITE_OFF"
  | "MARKET_SECURITIES_CLEARING"
  | "CORPORATE_ACTION_CLEARING"
  | "WAGER_CLEARING";

export interface LedgerAccount {
  readonly id: LedgerAccountId;
  readonly environmentId: EnvironmentId;
  readonly scope: EconomicScope;
  readonly kind: LedgerAccountKind;
  readonly ownerId?: string;
}

export interface LedgerAccountCatalog {
  get(accountId: LedgerAccountId): Promise<LedgerAccount | null>;
}

export class InMemoryLedgerAccountCatalog implements LedgerAccountCatalog {
  readonly #accounts: ReadonlyMap<LedgerAccountId, LedgerAccount>;

  constructor(accounts: readonly LedgerAccount[]) {
    const entries = accounts.map((account) => [account.id, Object.freeze({ ...account })] as const);
    this.#accounts = new Map(entries);
    if (this.#accounts.size !== accounts.length) throw new Error("Duplicate ledger account ID");
  }

  async get(accountId: LedgerAccountId): Promise<LedgerAccount | null> {
    return this.#accounts.get(accountId) ?? null;
  }
}
