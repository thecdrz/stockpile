import { Price, Rate, type Currency, type TimeInForce } from "@stockpile/core";
import type {
  CorporateAction,
  FxObservation,
  FxPair,
  MarketDataProvider,
  MarketObservation,
  Security,
  SecurityId,
} from "@stockpile/market-data";

interface SyntheticDefinition extends Security {
  readonly anchorPrice: string;
}

export const MVP_SECURITIES: readonly SyntheticDefinition[] = Object.freeze([
  Object.freeze({
    id: "10b5db59-5660-4a99-aa40-8a42862f0a01" as SecurityId,
    symbol: "MAPL",
    name: "Maple Broad Market Fund",
    exchange: "SYNTHETIC_CA",
    mic: "XTSE",
    currency: "CAD" as Currency,
    kind: "ETF",
    anchorPrice: "52.40",
  }),
  Object.freeze({
    id: "10b5db59-5660-4a99-aa40-8a42862f0a02" as SecurityId,
    symbol: "NSTAR",
    name: "Northstar Industries",
    exchange: "SYNTHETIC_CA",
    mic: "XTSE",
    currency: "CAD" as Currency,
    kind: "STOCK",
    anchorPrice: "84.15",
  }),
  Object.freeze({
    id: "10b5db59-5660-4a99-aa40-8a42862f0a03" as SecurityId,
    symbol: "ORBT",
    name: "Orbit Systems",
    exchange: "SYNTHETIC_US",
    mic: "XNAS",
    currency: "USD" as Currency,
    kind: "STOCK",
    anchorPrice: "118.70",
  }),
]);

/** A license-safe, deterministic sandbox feed. Prices change once per UTC minute. */
export class MvpSyntheticMarketDataProvider implements MarketDataProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async findSecurities(query: string): Promise<readonly Security[]> {
    const needle = query.trim().toUpperCase();
    if (!needle) return MVP_SECURITIES;
    return MVP_SECURITIES.filter((security) =>
      security.symbol.includes(needle) || security.name.toUpperCase().includes(needle),
    );
  }

  async getLatestObservation(securityId: SecurityId): Promise<MarketObservation | null> {
    const security = MVP_SECURITIES.find((candidate) => candidate.id === securityId);
    if (!security) return null;
    const timestamp = this.now();
    const minute = Math.floor(timestamp.getTime() / 60_000);
    const symbolSeed = [...security.symbol].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const waveBasisPoints = ((minute + symbolSeed) % 41) - 20;
    const price = (Number(security.anchorPrice) * (1 + waveBasisPoints / 10_000)).toFixed(4);
    return Object.freeze({
      securityId,
      price: Price.of(price, security.currency),
      marketTimestamp: timestamp,
      receivedAt: timestamp,
      freshness: "REALTIME",
      source: "SYNTHETIC",
      reference: `synthetic:mvp:${security.symbol}:${minute}`,
    });
  }

  async getLatestFxObservation(pair: FxPair): Promise<FxObservation | null> {
    if (pair !== "USD/CAD") return null;
    const timestamp = this.now();
    const minute = Math.floor(timestamp.getTime() / 60_000);
    return Object.freeze({
      pair,
      basePerForeignRate: Rate.of("1.36"),
      marketTimestamp: timestamp,
      receivedAt: timestamp,
      freshness: "REALTIME",
      source: "SYNTHETIC",
      reference: `synthetic:mvp:USDCAD:${minute}`,
    });
  }

  async getCorporateActions(_fromDate: string, _throughDate: string): Promise<readonly CorporateAction[]> {
    return Object.freeze([]);
  }
}

export class MvpAlwaysOpenSessionPolicy {
  async getSession(_securityId: SecurityId, _at: string): Promise<{ readonly isOpen: true }> {
    return Object.freeze({ isOpen: true });
  }

  async expirationFor(_securityId: SecurityId, acceptedAt: string, timeInForce: TimeInForce): Promise<string> {
    const duration = timeInForce === "DAY" ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
    return new Date(Date.parse(acceptedAt) + duration).toISOString();
  }
}
