import { describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresSecurityDirectory } from "./postgres-security-directory.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

class DirectoryClient implements PgClientLike {
  readonly statements: string[] = [];
  constructor(private readonly existingSymbol?: string) {}
  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("SELECT id, symbol")) {
      return result(this.existingSymbol ? [{ id: "security:1", symbol: this.existingSymbol }] : []) as unknown as QueryResult<Row>;
    }
    return result<Row>();
  }
  release(): void {}
}

function poolFor(client: DirectoryClient): PgPoolLike {
  return { connect: async () => client, query: async <Row extends QueryResultRow>() => result<Row>() };
}

const command = {
  securityId: "40000000-0000-4000-8000-000000000001" as never,
  symbol: "ORBT", name: "Orbit Systems", exchange: "SYNTHETIC_CA" as const,
  mic: "XTSE", currency: "CAD" as const, countryCode: "CA" as const, kind: "STOCK" as const,
  provider: "SYNTHETIC", providerSecurityId: "fixture:orbt", firstSupportedDate: "2026-01-01",
  eligibleForTrading: true, observedAt: "2026-09-12T12:00:00.000Z",
};

describe("PostgresSecurityDirectory", () => {
  it("creates a normalized listing and provider mapping without relying on ticker identity", async () => {
    const client = new DirectoryClient();
    const directory = new PostgresSecurityDirectory(poolFor(client), () => "generated:1");
    await expect(directory.synchronize(command)).resolves.toEqual({ securityId: command.securityId, created: true, symbolChanged: false });
    expect(client.statements.some((sql) => sql.includes("INSERT INTO securities"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("security_provider_identifiers"))).toBe(true);
    expect(client.statements.at(-1)).toBe("COMMIT");
  });

  it("preserves the old ticker as an alias when the stable listing identity changes symbol", async () => {
    const client = new DirectoryClient("OLD");
    const directory = new PostgresSecurityDirectory(poolFor(client), () => "generated:1");
    await expect(directory.synchronize(command)).resolves.toEqual({ securityId: command.securityId, created: false, symbolChanged: true });
    expect(client.statements.some((sql) => sql.includes("security_symbol_aliases"))).toBe(true);
    expect(client.statements.some((sql) => sql.includes("UPDATE securities"))).toBe(true);
  });
});
