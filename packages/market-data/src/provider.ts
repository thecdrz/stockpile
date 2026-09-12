import type { Currency, ObservationFreshness, Price, Rate } from "@stockpile/core";

export type SecurityId = string & { readonly __securityId: unique symbol };

export interface Security {
  readonly id: SecurityId;
  readonly symbol: string;
  readonly name: string;
  readonly exchange: "SYNTHETIC_US" | "SYNTHETIC_CA";
  readonly mic: "XNYS" | "XNAS" | "XTSE";
  readonly currency: Currency;
  readonly kind: "STOCK" | "ETF";
}

export interface MarketObservation {
  readonly securityId: SecurityId;
  readonly price: Price;
  readonly marketTimestamp: Date;
  readonly receivedAt: Date;
  readonly freshness: ObservationFreshness;
  readonly source: "SYNTHETIC";
  readonly reference: string;
}

export type FxPair = "USD/CAD";

export interface FxObservation {
  readonly pair: FxPair;
  readonly basePerForeignRate: Rate;
  readonly marketTimestamp: Date;
  readonly receivedAt: Date;
  readonly freshness: ObservationFreshness;
  readonly source: "SYNTHETIC";
  readonly reference: string;
}

export interface DividendAction {
  readonly type: "DIVIDEND";
  readonly id: string;
  readonly securityId: SecurityId;
  readonly exDate: string;
  readonly paymentDate?: string;
  readonly amountPerShare: Price;
  readonly reference: string;
}

export interface SplitAction {
  readonly type: "SPLIT";
  readonly id: string;
  readonly securityId: SecurityId;
  readonly effectiveDate: string;
  readonly ratio: string;
  readonly reference: string;
}

export interface SymbolChangeAction {
  readonly type: "SYMBOL_CHANGE";
  readonly id: string;
  readonly securityId: SecurityId;
  readonly effectiveDate: string;
  readonly newSymbol: string;
  readonly reference: string;
}

export interface DelistingAction {
  readonly type: "DELISTING";
  readonly id: string;
  readonly securityId: SecurityId;
  readonly effectiveDate: string;
  readonly reference: string;
}

export interface MergerAction {
  readonly type: "MERGER";
  readonly id: string;
  readonly securityId: SecurityId;
  readonly effectiveDate: string;
  readonly termsComplete: boolean;
  readonly cashPerShare?: Price;
  readonly stockSecurityId?: SecurityId;
  readonly stockRatio?: string;
  /** Required for mixed cash/stock consideration; fraction of old basis transferred to replacement stock. */
  readonly stockBasisPercentage?: string;
  readonly reference: string;
}

export interface SpinoffAction {
  readonly type: "SPINOFF";
  readonly id: string;
  readonly securityId: SecurityId;
  readonly effectiveDate: string;
  readonly termsComplete: boolean;
  readonly childSecurityId?: SecurityId;
  readonly childRatio?: string;
  readonly parentBasisPercentage?: string;
  readonly reference: string;
}

export type CorporateAction = DividendAction | SplitAction | SymbolChangeAction | DelistingAction | MergerAction | SpinoffAction;

export interface MarketDataProvider {
  findSecurities(query: string): Promise<readonly Security[]>;
  getLatestObservation(securityId: SecurityId): Promise<MarketObservation | null>;
  getLatestFxObservation(pair: FxPair): Promise<FxObservation | null>;
  getCorporateActions(fromDate: string, throughDate: string): Promise<readonly CorporateAction[]>;
}
