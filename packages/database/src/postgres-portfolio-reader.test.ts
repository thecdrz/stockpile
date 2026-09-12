import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresPortfolioReader } from "./postgres-portfolio-reader.js";

function result<Row extends QueryResultRow>(rows: Row[] = []): QueryResult<Row> {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

class PortfolioPool implements PgPoolLike {
  async connect(): Promise<PgClientLike> {
    throw new Error("not used");
  }

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    if (text.includes("FROM players player")) {
      return result([
        {
          player_id: "player:1",
          display_name: "Scott",
          player_type: "HUMAN",
          financial_status: "New Investor",
          credit_rating: "C",
          base_currency: "CAD",
          cash_balance: "99800.00000000",
          reserved_cash: "200.00000000",
          position_account_id: "position:1",
        },
      ]) as unknown as QueryResult<Row>;
    }
    return result([
      {
        security_id: "security:1",
        symbol: "NSTAR",
        name: "Northstar Industries",
        exchange: "SYNTHETIC_US",
        listing_currency: "USD",
        kind: "STOCK",
        quantity: "1.600000000000",
        remaining_cost: "200.00000000",
        realized_gain_loss: "0.00000000",
      },
    ]) as unknown as QueryResult<Row>;
  }
}

describe("PostgresPortfolioReader", () => {
  it("returns authoritative cash availability and base-currency cost basis", async () => {
    const portfolio = await new PostgresPortfolioReader(new PortfolioPool()).getCareerByDiscordUser(
      "environment:1" as never,
      "discord:1",
    );
    expect(portfolio?.availableCash.toString()).toBe("99600.00000000");
    expect(portfolio?.holdings[0]?.remainingCost.currency).toBe("CAD");
    expect(portfolio?.holdings[0]?.quantity.toString()).toBe("1.600000000000");
  });
});
