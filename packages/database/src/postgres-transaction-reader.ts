import { Money,type Currency } from "@stockpile/core";
import type { EnvironmentId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";
interface TransactionRow extends QueryResultRow{id:string;event_type:string;business_effective_at:Date;amount:string;currency:Currency;}
export interface CareerTransactionRecord{readonly id:string;readonly eventType:string;readonly effectiveAt:string;readonly cashEffect:Money;}
export class PostgresTransactionReader{
  constructor(private readonly pool:PgPoolLike){}
  async recentCareer(environmentId:EnvironmentId,discordUserId:string,limit=20):Promise<readonly CareerTransactionRecord[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Transaction limit must be between 1 and 100");
    const result=await this.pool.query<TransactionRow>(`SELECT event.id,event.event_type,event.business_effective_at,
      sum(CASE entry.direction WHEN 'DEBIT' THEN entry.amount ELSE -entry.amount END)::text AS amount,entry.currency
      FROM players player JOIN ledger_accounts cash ON cash.environment_id=player.environment_id AND cash.scope='CAREER'
        AND cash.owner_id=player.id::text AND cash.kind='PLAYER_CASH'
      JOIN journal_entries entry ON entry.ledger_account_id=cash.id
      JOIN financial_events event ON event.id=entry.financial_event_id
      WHERE player.environment_id=$1 AND player.discord_user_id=$2
      GROUP BY event.id,event.event_type,event.business_effective_at,entry.currency
      ORDER BY event.business_effective_at DESC,event.id DESC LIMIT $3`,[environmentId,discordUserId,limit]);
    return Object.freeze(result.rows.map(row=>Object.freeze({id:row.id,eventType:row.event_type,
      effectiveAt:row.business_effective_at.toISOString(),cashEffect:Money.of(row.amount,row.currency)})));
  }
}
