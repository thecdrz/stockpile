import { Money, Quantity, type Currency } from "@stockpile/core";
import type { EnvironmentId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

interface IdentityRow extends QueryResultRow {
  player_id: string;
  display_name: string;
  player_type: "HUMAN" | "NPC";
  financial_status: string;
  credit_rating: string;
  base_currency: Currency;
  cash_balance: string;
  reserved_cash: string;
  position_account_id: string;
}

interface HoldingRow extends QueryResultRow {
  security_id: string;
  symbol: string;
  name: string;
  exchange: string;
  listing_currency: Currency;
  kind: "STOCK" | "ETF";
  quantity: string;
  remaining_cost: string;
  realized_gain_loss: string;
}

export interface PortfolioHoldingRecord {
  readonly securityId: string;
  readonly symbol: string;
  readonly name: string;
  readonly exchange: string;
  readonly listingCurrency: Currency;
  readonly kind: "STOCK" | "ETF";
  readonly quantity: Quantity;
  readonly remainingCost: Money;
  readonly realizedGainLoss: Money;
}

export interface CareerPortfolioRecord {
  readonly playerId: string;
  readonly displayName: string;
  readonly playerType: "HUMAN" | "NPC";
  readonly financialStatus: string;
  readonly creditRating: string;
  readonly baseCurrency: Currency;
  readonly cashBalance: Money;
  readonly reservedCash: Money;
  readonly availableCash: Money;
  readonly positionAccountId: string;
  readonly holdings: readonly PortfolioHoldingRecord[];
}

export class PostgresPortfolioReader {
  constructor(private readonly pool: PgPoolLike) {}

  async getCareerByDiscordUser(
    environmentId: EnvironmentId,
    discordUserId: string,
  ): Promise<CareerPortfolioRecord | null> {
    const identityResult = await this.pool.query<IdentityRow>(
      `SELECT player.id AS player_id, player.display_name, player.player_type,
              profile.financial_status, profile.credit_rating, environment.base_currency,
              COALESCE(balance.amount, 0)::text AS cash_balance,
              COALESCE(reservation.amount, 0)::text AS reserved_cash,
              position.id AS position_account_id
       FROM players player
       JOIN environments environment ON environment.id = player.environment_id
       JOIN player_profiles profile ON profile.player_id = player.id
       JOIN ledger_accounts cash
         ON cash.environment_id = player.environment_id AND cash.scope = 'CAREER'
        AND cash.owner_id = player.id::text AND cash.kind = 'PLAYER_CASH'
       JOIN position_accounts position
         ON position.environment_id = player.environment_id AND position.scope = 'CAREER'
        AND position.owner_id = player.id::text AND position.league_period IS NULL
       LEFT JOIN LATERAL (
         SELECT sum(CASE entry.direction WHEN 'DEBIT' THEN entry.amount ELSE -entry.amount END) AS amount
         FROM journal_entries entry
         WHERE entry.ledger_account_id = cash.id AND entry.currency = environment.base_currency
       ) balance ON true
       LEFT JOIN LATERAL (
         SELECT sum(active.amount) AS amount FROM cash_reservations active
         WHERE active.ledger_account_id = cash.id AND active.currency = environment.base_currency
           AND active.status = 'ACTIVE'
       ) reservation ON true
       WHERE player.environment_id = $1 AND player.discord_user_id = $2 AND player.active`,
      [environmentId, discordUserId],
    );
    const identity = identityResult.rows[0];
    if (!identity) return null;
    const holdingsResult = await this.pool.query<HoldingRow>(
      `SELECT security.id AS security_id, security.symbol, security.name, security.exchange,
              security.listing_currency, security.kind, basis.quantity::text,
              basis.remaining_cost::text, basis.realized_gain_loss::text
       FROM position_cost_basis basis
       JOIN securities security ON security.id = basis.security_id
       WHERE basis.position_account_id = $1 AND basis.quantity > 0
       ORDER BY security.symbol, security.exchange`,
      [identity.position_account_id],
    );
    const cashBalance = Money.of(identity.cash_balance, identity.base_currency);
    const reservedCash = Money.of(identity.reserved_cash, identity.base_currency);
    return Object.freeze({
      playerId: identity.player_id,
      displayName: identity.display_name,
      playerType: identity.player_type,
      financialStatus: identity.financial_status,
      creditRating: identity.credit_rating,
      baseCurrency: identity.base_currency,
      cashBalance,
      reservedCash,
      availableCash: cashBalance.subtract(reservedCash),
      positionAccountId: identity.position_account_id,
      holdings: Object.freeze(holdingsResult.rows.map((holding) => mapHolding(holding, identity.base_currency))),
    });
  }
}

function mapHolding(row: HoldingRow, baseCurrency: Currency): PortfolioHoldingRecord {
  return Object.freeze({
    securityId: row.security_id,
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    listingCurrency: row.listing_currency,
    kind: row.kind,
    quantity: Quantity.of(row.quantity),
    remainingCost: Money.of(row.remaining_cost, baseCurrency),
    realizedGainLoss: Money.of(row.realized_gain_loss, baseCurrency),
  });
}
