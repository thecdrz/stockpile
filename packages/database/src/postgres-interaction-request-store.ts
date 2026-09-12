import type { EnvironmentId, JsonObject } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgPoolLike } from "./pg-types.js";

interface RequestRow extends QueryResultRow { id:string;payload:JsonObject;status:"PREVIEW"|"SUBMITTED";expires_at:Date;submitted_order_id:string|null; }
export interface TradeInteractionRequest { readonly id:string;readonly payload:JsonObject;readonly status:"PREVIEW"|"SUBMITTED";
  readonly expiresAt:string;readonly submittedOrderId:string|null; }
export class PostgresInteractionRequestStore {
  constructor(private readonly pool:PgPoolLike,private readonly nextId:()=>string){}
  async createTrade(environmentId:EnvironmentId,discordUserId:string,payload:JsonObject,createdAt:string,expiresAt:string):Promise<TradeInteractionRequest>{
    if(Number.isNaN(Date.parse(createdAt))||Number.isNaN(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.parse(createdAt))throw new Error("Invalid interaction request lifetime");
    const result=await this.pool.query<RequestRow>(`INSERT INTO interaction_action_requests
      (id,environment_id,player_id,action_type,payload,status,expires_at,created_at,updated_at)
      SELECT $1,$2,player.id,'TRADE',$4,'PREVIEW',$5,$6,$6 FROM players player
      WHERE player.environment_id=$2 AND player.discord_user_id=$3 AND player.active
      RETURNING id,payload,status,expires_at,submitted_order_id`,[this.nextId(),environmentId,discordUserId,payload,expiresAt,createdAt]);
    const row=result.rows[0];if(!row)throw new Error("Active player not found");return map(row);
  }
  async getTrade(environmentId:EnvironmentId,discordUserId:string,requestId:string,now:string):Promise<TradeInteractionRequest|null>{
    const result=await this.pool.query<RequestRow>(`SELECT request.id,request.payload,request.status,request.expires_at,request.submitted_order_id
      FROM interaction_action_requests request JOIN players player ON player.id=request.player_id
      WHERE request.id=$1 AND request.environment_id=$2 AND player.discord_user_id=$3
        AND request.action_type='TRADE' AND request.status IN ('PREVIEW','SUBMITTED') AND request.expires_at>$4`,
    [requestId,environmentId,discordUserId,now]);return result.rows[0]?map(result.rows[0]):null;
  }
  async markSubmitted(requestId:string,orderId:string,updatedAt:string):Promise<void>{
    const result=await this.pool.query(`UPDATE interaction_action_requests SET status='SUBMITTED',submitted_order_id=$2,updated_at=$3
      WHERE id=$1 AND status IN ('PREVIEW','SUBMITTED') AND (submitted_order_id IS NULL OR submitted_order_id=$2)`,[requestId,orderId,updatedAt]);
    if(result.rowCount!==1)throw new Error("Interaction request submission conflict");
  }
  async cancel(environmentId:EnvironmentId,discordUserId:string,requestId:string,updatedAt:string):Promise<boolean>{
    const result=await this.pool.query(`UPDATE interaction_action_requests request SET status='CANCELLED',updated_at=$4
      FROM players player WHERE request.id=$1 AND request.environment_id=$2 AND request.player_id=player.id
      AND player.discord_user_id=$3 AND request.status='PREVIEW'`,[requestId,environmentId,discordUserId,updatedAt]);return result.rowCount===1;
  }
}
function map(row:RequestRow):TradeInteractionRequest{return Object.freeze({id:row.id,payload:deepFreeze(structuredClone(row.payload)),
  status:row.status,expiresAt:row.expires_at.toISOString(),submittedOrderId:row.submitted_order_id});}
function deepFreeze<T>(value:T):T{if(value!==null&&typeof value==="object"){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
