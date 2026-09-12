import { Money, Rate, convertForeignTrade } from "@stockpile/core";
import type { CareerPortfolioRecord } from "@stockpile/database";
import type { EnvironmentId } from "@stockpile/ledger";
import type { MarketDataProvider, SecurityId } from "@stockpile/market-data";

export interface CareerPortfolioReader {
  getCareerByDiscordUser(environmentId: EnvironmentId, discordUserId: string): Promise<CareerPortfolioRecord | null>;
}

export type ValuationStatus = "FRESH" | "STALE" | "UNAVAILABLE";

export type DashboardHolding = CareerPortfolioRecord["holdings"][number] & {
  readonly latestPrice: string | null;
  readonly priceAsOf: string | null;
  readonly marketValue: Money | null;
  readonly valuationStatus: ValuationStatus;
  readonly marketDataReference: string | null;
  readonly fxReference: string | null;
};

export interface CareerDashboard {
  readonly playerId: string;
  readonly displayName: string;
  readonly playerType: "HUMAN" | "NPC";
  readonly financialStatus: string;
  readonly creditRating: string;
  readonly baseCurrency: CareerPortfolioRecord["baseCurrency"];
  readonly cashBalance: Money;
  readonly reservedCash: Money;
  readonly availableCash: Money;
  readonly holdings: readonly DashboardHolding[];
  readonly estimatedNetWorth: Money;
  readonly valuationComplete: boolean;
}

export class CareerDashboardService {
  constructor(
    private readonly portfolios: CareerPortfolioReader,
    private readonly marketData: MarketDataProvider,
    private readonly now: () => string,
    private readonly freshWithinSeconds = 300,
  ) {}

  async get(environmentId: EnvironmentId, discordUserId: string): Promise<CareerDashboard | null> {
    const portfolio = await this.portfolios.getCareerByDiscordUser(environmentId, discordUserId);
    if (!portfolio) return null;
    const needsUsdCad = portfolio.holdings.some((holding) => holding.listingCurrency !== portfolio.baseCurrency);
    const fx = needsUsdCad ? await this.marketData.getLatestFxObservation("USD/CAD") : null;
    const holdings = await Promise.all(
      portfolio.holdings.map(async (holding): Promise<DashboardHolding> => {
        const observation = await this.marketData.getLatestObservation(holding.securityId as SecurityId);
        if (!observation || observation.freshness === "UNAVAILABLE") return unavailableHolding(holding);
        const foreignValue = observation.price.notional(holding.quantity);
        let marketValue: Money | null = foreignValue;
        if (holding.listingCurrency !== portfolio.baseCurrency) {
          if (!fx || fx.freshness === "UNAVAILABLE") return unavailableHolding(holding);
          marketValue = convertForeignTrade(
            foreignValue,
            portfolio.baseCurrency,
            fx.basePerForeignRate,
            Rate.of("0"),
            "SELL",
          ).grossBaseAmount;
        }
        const ageSeconds = (Date.parse(this.now()) - observation.marketTimestamp.getTime()) / 1000;
        const valuationStatus: ValuationStatus =
          observation.freshness === "STALE" || observation.freshness === "END_OF_DAY" || ageSeconds > this.freshWithinSeconds
            ? "STALE"
            : "FRESH";
        return Object.freeze({
          ...holding,
          latestPrice: observation.price.toString(),
          priceAsOf: observation.marketTimestamp.toISOString(),
          marketValue,
          valuationStatus,
          marketDataReference: observation.reference,
          fxReference: holding.listingCurrency === portfolio.baseCurrency ? null : fx?.reference ?? null,
        });
      }),
    );
    let estimatedNetWorth = portfolio.cashBalance;
    for (const holding of holdings) {
      if (holding.marketValue) estimatedNetWorth = estimatedNetWorth.add(holding.marketValue);
    }
    return Object.freeze({
      playerId: portfolio.playerId,
      displayName: portfolio.displayName,
      playerType: portfolio.playerType,
      financialStatus: portfolio.financialStatus,
      creditRating: portfolio.creditRating,
      baseCurrency: portfolio.baseCurrency,
      cashBalance: portfolio.cashBalance,
      reservedCash: portfolio.reservedCash,
      availableCash: portfolio.availableCash,
      holdings: Object.freeze(holdings),
      estimatedNetWorth,
      valuationComplete: holdings.every((holding) => holding.valuationStatus === "FRESH"),
    });
  }
}

function unavailableHolding(
  holding: CareerPortfolioRecord["holdings"][number],
): DashboardHolding {
  return Object.freeze({
    ...holding,
    latestPrice: null,
    priceAsOf: null,
    marketValue: null,
    valuationStatus: "UNAVAILABLE",
    marketDataReference: null,
    fxReference: null,
  });
}
