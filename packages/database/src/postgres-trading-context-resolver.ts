import type { Currency, TradingAccountId } from "@stockpile/core";
import type { EnvironmentId, LedgerAccountId } from "@stockpile/ledger";
import type { SecurityId } from "@stockpile/market-data";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

interface ContextRow extends QueryResultRow { trading_account_id:string; cash_account_id:string; security_id:string;
  listing_currency:Currency;base_currency:Currency; }
export interface ResolvedTradingContext { readonly tradingAccountId:TradingAccountId;readonly playerCashAccountId:LedgerAccountId;
  readonly securityId:SecurityId;readonly listingCurrency:Currency;readonly baseCurrency:Currency; }

export class PostgresTradingContextResolver {
  constructor(private readonly pool:PgPoolLike){}
  async resolve(environmentId:EnvironmentId,discordUserId:string,scope:"CAREER"|"LEAGUE",securityId:SecurityId):Promise<ResolvedTradingContext|null>{
    if(scope!=="CAREER")throw new Error("League trading is deferred from the MVP");
    const result=await this.pool.query<ContextRow>(`SELECT position.id AS trading_account_id,cash.id AS cash_account_id,
      security.id AS security_id,security.listing_currency,environment.base_currency
      FROM players player JOIN environments environment ON environment.id=player.environment_id
      JOIN position_accounts position ON position.environment_id=player.environment_id AND position.scope=$3
        AND position.owner_id=player.id::text AND position.league_period IS NULL
      JOIN ledger_accounts cash ON cash.environment_id=player.environment_id AND cash.scope=$3
        AND cash.owner_id=player.id::text AND cash.kind='PLAYER_CASH'
      JOIN securities security ON security.id=$4 AND security.trading_status='ACTIVE' AND security.eligible_for_trading
      WHERE player.environment_id=$1 AND player.discord_user_id=$2 AND player.active`,[environmentId,discordUserId,scope,securityId]);
    const row=result.rows[0];
    return row?Object.freeze({tradingAccountId:row.trading_account_id as TradingAccountId,
      playerCashAccountId:row.cash_account_id as LedgerAccountId,securityId:row.security_id as SecurityId,
      listingCurrency:row.listing_currency,baseCurrency:row.base_currency}):null;
  }
}
