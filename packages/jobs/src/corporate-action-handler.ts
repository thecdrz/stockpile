import type { ApplySplitCommand, CreditDividendCommand } from "@stockpile/database";
import type { ClaimedJob } from "@stockpile/database";
import type {
  CorporateAction, DelistingAction, MarketDataProvider, MergerAction,
  SecurityId, SpinoffAction, SymbolChangeAction,
} from "@stockpile/market-data";
import type { Currency } from "@stockpile/core";

export interface SplitProcessor {
  apply(command: ApplySplitCommand): Promise<unknown>;
}

export interface DividendProcessor {
  credit(command: CreditDividendCommand): Promise<unknown>;
}

export interface CorporateActionCalendar {
  priorSessionClose(securityId: SecurityId, exDate: string): Promise<string>;
}

export interface SecurityLifecycleProcessor {
  applySymbolChange(environmentId: ClaimedJob["environmentId"], action: SymbolChangeAction, appliedAt: string): Promise<unknown>;
  applyDelisting(environmentId: ClaimedJob["environmentId"], action: DelistingAction, appliedAt: string): Promise<unknown>;
  placeInReview(environmentId: ClaimedJob["environmentId"], action: MergerAction | SpinoffAction, appliedAt: string): Promise<unknown>;
}

export interface MergerProcessor {
  settle(
    environmentId: ClaimedJob["environmentId"], action: MergerAction, appliedAt: string, ruleset: string,
    fx?: { readonly basePerForeignRate: import("@stockpile/core").Rate; readonly reference: string },
  ): Promise<unknown>;
}

export interface SpinoffProcessor {
  apply(environmentId: ClaimedJob["environmentId"], action: SpinoffAction, appliedAt: string, ruleset: string): Promise<unknown>;
}

export interface CorporateActionHandlerOptions {
  readonly marketData: MarketDataProvider;
  readonly splits: SplitProcessor;
  readonly dividends: DividendProcessor;
  readonly calendar: CorporateActionCalendar;
  readonly now: () => string;
  readonly economyRulesetVersion: string;
  readonly baseCurrency: Currency;
  readonly lifecycle: SecurityLifecycleProcessor;
  readonly mergers: MergerProcessor;
  readonly spinoffs: SpinoffProcessor;
}

interface CorporateActionPayload {
  readonly fromDate: string;
  readonly throughDate: string;
}

export function createCorporateActionHandler(options: CorporateActionHandlerOptions) {
  return async (job: ClaimedJob): Promise<void> => {
    const payload = parsePayload(job.payload);
    const actions = await options.marketData.getCorporateActions(payload.fromDate, payload.throughDate);
    for (const action of stableOrder(actions)) {
      if (action.type === "SPLIT") {
        await options.splits.apply({
          environmentId: job.environmentId,
          action,
          appliedAt: options.now(),
          economyRulesetVersion: options.economyRulesetVersion,
        });
        continue;
      }
      if (action.type === "SYMBOL_CHANGE") {
        await options.lifecycle.applySymbolChange(job.environmentId, action, options.now());
        continue;
      }
      if (action.type === "DELISTING") {
        await options.lifecycle.applyDelisting(job.environmentId, action, options.now());
        continue;
      }
      if (action.type === "MERGER") {
        if (!hasCompleteMergerTerms(action)) {
          await options.lifecycle.placeInReview(job.environmentId, action, options.now());
          continue;
        }
        const requiresMergerFx = action.cashPerShare !== undefined && action.cashPerShare.currency !== options.baseCurrency;
        const mergerFx = requiresMergerFx ? await options.marketData.getLatestFxObservation("USD/CAD") : null;
        if (requiresMergerFx && (!mergerFx || mergerFx.freshness === "STALE" || mergerFx.freshness === "UNAVAILABLE" || mergerFx.freshness === "END_OF_DAY")) {
          throw new Error(`Trustworthy merger FX unavailable for ${action.id}`);
        }
        await options.mergers.settle(job.environmentId, action, options.now(), options.economyRulesetVersion,
          mergerFx ? { basePerForeignRate: mergerFx.basePerForeignRate, reference: mergerFx.reference } : undefined);
        continue;
      }
      if (action.type === "SPINOFF") {
        if (hasCompleteSpinoffTerms(action)) await options.spinoffs.apply(job.environmentId, action, options.now(), options.economyRulesetVersion);
        else await options.lifecycle.placeInReview(job.environmentId, action, options.now());
        continue;
      }
      const entitlementCutoff = await options.calendar.priorSessionClose(action.securityId, action.exDate);
      const requiresFx = action.amountPerShare.currency !== options.baseCurrency;
      const fx = requiresFx
        ? await options.marketData.getLatestFxObservation("USD/CAD")
        : null;
      if (requiresFx &&
          (!fx || fx.freshness === "STALE" || fx.freshness === "UNAVAILABLE" || fx.freshness === "END_OF_DAY")) {
        throw new Error(`Trustworthy dividend FX unavailable for ${action.id}`);
      }
      await options.dividends.credit({
        environmentId: job.environmentId,
        action,
        entitlementCutoff,
        processedAt: options.now(),
        economyRulesetVersion: options.economyRulesetVersion,
        ...(fx ? { basePerForeignRate: fx.basePerForeignRate, fxReference: fx.reference } : {}),
      });
    }
  };
}

function hasCompleteMergerTerms(action: MergerAction): boolean {
  if (!action.termsComplete) return false;
  const hasCash = action.cashPerShare !== undefined;
  const hasStock = action.stockSecurityId !== undefined && action.stockRatio !== undefined;
  if (!hasCash && !hasStock) return false;
  if ((action.stockSecurityId === undefined) !== (action.stockRatio === undefined)) return false;
  return !(hasCash && hasStock && action.stockBasisPercentage === undefined);
}

function hasCompleteSpinoffTerms(action: SpinoffAction): boolean {
  return action.termsComplete && action.childSecurityId !== undefined && action.childRatio !== undefined &&
    action.parentBasisPercentage !== undefined;
}

function parsePayload(payload: ClaimedJob["payload"]): CorporateActionPayload {
  const fromDate = payload["fromDate"];
  const throughDate = payload["throughDate"];
  if (typeof fromDate !== "string" || typeof throughDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(throughDate) || fromDate > throughDate) {
    throw new Error("Invalid corporate-action processing range");
  }
  return Object.freeze({ fromDate, throughDate });
}

function stableOrder(actions: readonly CorporateAction[]): readonly CorporateAction[] {
  return [...actions].sort((left, right) => {
    const leftDate = left.type === "DIVIDEND" ? left.exDate : left.effectiveDate;
    const rightDate = right.type === "DIVIDEND" ? right.exDate : right.effectiveDate;
    return `${leftDate}:${left.id}`.localeCompare(`${rightDate}:${right.id}`);
  });
}
