import { Money } from "@stockpile/core";
import type { SaveNetWorthSnapshotCommand, SavedNetWorthSnapshot } from "@stockpile/database";
import type { EnvironmentId } from "@stockpile/ledger";
import type { CareerDashboardService } from "./career-dashboard.js";

export interface NetWorthSnapshotWriter {
  save(command: SaveNetWorthSnapshotCommand): Promise<SavedNetWorthSnapshot>;
}

export interface CaptureCareerSnapshotCommand {
  readonly environmentId: EnvironmentId;
  readonly discordUserId: string;
  readonly effectiveAt: string;
  readonly sourceKey: string;
  readonly valuationRulesetVersion: string;
}

export class CareerSnapshotService {
  constructor(
    private readonly dashboards: CareerDashboardService,
    private readonly snapshots: NetWorthSnapshotWriter,
    private readonly now: () => string,
  ) {}

  async capture(command: CaptureCareerSnapshotCommand): Promise<SavedNetWorthSnapshot> {
    const dashboard = await this.dashboards.get(command.environmentId, command.discordUserId);
    if (!dashboard) throw new Error("Career account not found");
    if (!dashboard.valuationComplete) throw new Error("Official snapshot requires complete fresh valuation evidence");
    return this.snapshots.save({
      environmentId: command.environmentId,
      playerId: dashboard.playerId,
      scope: "CAREER",
      effectiveAt: command.effectiveAt,
      cash: dashboard.cashBalance,
      positions: dashboard.holdings.map((holding) => {
        if (!holding.marketValue || !holding.marketDataReference) throw new Error("Snapshot holding evidence is incomplete");
        return {
          securityId: holding.securityId,
          quantity: holding.quantity,
          marketValue: holding.marketValue,
          marketDataReference: holding.marketDataReference,
          ...(holding.fxReference === null ? {} : { fxReference: holding.fxReference }),
        };
      }),
      prestigeLiquidationValue: Money.zero(dashboard.baseCurrency),
      collectibleLoanReceivables: Money.zero(dashboard.baseCurrency),
      totalDebt: Money.zero(dashboard.baseCurrency),
      accruedInterest: Money.zero(dashboard.baseCurrency),
      valuationRulesetVersion: command.valuationRulesetVersion,
      sourceKey: command.sourceKey,
      createdAt: this.now(),
    });
  }
}
