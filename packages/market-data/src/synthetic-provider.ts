import type { CorporateAction, FxObservation, FxPair, MarketDataProvider, MarketObservation, Security, SecurityId } from "./provider.js";

export class SyntheticMarketDataProvider implements MarketDataProvider {
  readonly #securities: readonly Security[];
  readonly #observations: ReadonlyMap<SecurityId, MarketObservation>;
  readonly #fxObservations: ReadonlyMap<FxPair, FxObservation>;
  readonly #corporateActions: readonly CorporateAction[];

  constructor(
    securities: readonly Security[],
    observations: readonly MarketObservation[],
    fxObservations: readonly FxObservation[] = [],
    corporateActions: readonly CorporateAction[] = [],
  ) {
    this.#securities = [...securities];
    this.#observations = new Map(observations.map((observation) => [observation.securityId, observation]));
    this.#fxObservations = new Map(fxObservations.map((observation) => [observation.pair, observation]));
    this.#corporateActions = Object.freeze([...corporateActions]);
  }

  async findSecurities(query: string): Promise<readonly Security[]> {
    const normalized = query.trim().toLocaleLowerCase("en-CA");
    if (normalized.length === 0) return [];
    return this.#securities.filter((security) =>
      `${security.symbol} ${security.name}`.toLocaleLowerCase("en-CA").includes(normalized),
    );
  }

  async getLatestObservation(securityId: SecurityId): Promise<MarketObservation | null> {
    return this.#observations.get(securityId) ?? null;
  }

  async getLatestFxObservation(pair: FxPair): Promise<FxObservation | null> {
    return this.#fxObservations.get(pair) ?? null;
  }

  async getCorporateActions(fromDate: string, throughDate: string): Promise<readonly CorporateAction[]> {
    if (!isIsoDate(fromDate) || !isIsoDate(throughDate) || fromDate > throughDate) {
      throw new Error("Invalid corporate-action date range");
    }
    return this.#corporateActions.filter((action) => {
      const effectiveDate = action.type === "DIVIDEND" ? action.exDate : action.effectiveDate;
      return effectiveDate >= fromDate && effectiveDate <= throughDate;
    });
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}
