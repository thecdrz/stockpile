import { describe,expect,it } from "vitest";
import type { QueryResult,QueryResultRow } from "pg";
import type { PgClientLike,PgPoolLike } from "./pg-types.js";
import { PostgresSpinoffService } from "./postgres-spinoff-service.js";
function result<Row extends QueryResultRow>(rows:Row[]=[],rowCount=rows.length):QueryResult<Row>{return{rows,rowCount,command:"",oid:0,fields:[]};}
class Client implements PgClientLike{
  readonly statements:Array<{text:string;values?:readonly unknown[]}>=[];
  async query<Row extends QueryResultRow=QueryResultRow>(text:string,values?:readonly unknown[]):Promise<QueryResult<Row>>{
    this.statements.push(values===undefined?{text}:{text,values});
    if(text.includes("SELECT id FROM securities"))return result([{id:"child"}]) as unknown as QueryResult<Row>;
    if(text.includes("SELECT id,side,status FROM orders"))return result<Row>();
    if(text.includes("FROM position_cost_basis basis"))return result([{position_account_id:"position:1",scope:"CAREER",currency:"CAD",
      quantity:"10",remaining_cost:"100",realized_gain_loss:"0",version:"3"}]) as unknown as QueryResult<Row>;
    if(text.includes("SELECT 1 FROM corporate_action_applications")||text.includes("FROM position_cost_basis WHERE"))return result<Row>();
    if(text.includes("UPDATE position_cost_basis SET remaining_cost"))return result([],1) as QueryResult<Row>;
    if(text.includes("INSERT INTO outbox_events"))return result([{id:"outbox:1"}]) as unknown as QueryResult<Row>;
    return result<Row>();
  }
  release():void{}
}
describe("PostgresSpinoffService",()=>{
  it("creates fractional child shares and transfers only the provider-allocated basis",async()=>{
    const client=new Client();let n=0;
    const pool:PgPoolLike={connect:async()=>client,query:async<Row extends QueryResultRow>()=>result<Row>()};
    const service=new PostgresSpinoffService(pool,()=>`generated:${++n}`);
    await expect(service.apply("environment:1" as never,{type:"SPINOFF",id:"spinoff:1",securityId:"parent" as never,
      effectiveDate:"2026-09-15",termsComplete:true,childSecurityId:"child" as never,childRatio:"0.25",
      parentBasisPercentage:"0.8",reference:"fixture:spinoff:1"},"2026-09-15T12:00:00.000Z","1"))
      .resolves.toEqual({positionsChanged:1,ordersCancelled:0});
    const quantity=client.statements.find(({text})=>text.includes("INSERT INTO security_quantity_entries"));
    expect(quantity?.values?.[6]).toBe("2.500000000000");
    const transfer=client.statements.find(({text})=>text.includes("corporate_action_basis_transfers"));
    expect(transfer?.values?.[7]).toBe("20.00000000");
    expect(client.statements.at(-1)?.text).toBe("COMMIT");
  });
});
