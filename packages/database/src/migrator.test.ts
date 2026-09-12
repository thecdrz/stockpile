import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { migrateDatabase } from "./migrator.js";

function result<Row extends QueryResultRow>(rows: Row[] = []): QueryResult<Row> {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

class MigrationClient implements PgClientLike {
  readonly statements: string[] = [];
  released = false;

  constructor(private readonly appliedRows: QueryResultRow[] = []) {}

  async query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.statements.push(text);
    if (text.includes("SELECT name, checksum")) return result(this.appliedRows) as QueryResult<Row>;
    return result<Row>();
  }

  release(): void {
    this.released = true;
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixtureDirectory(sql: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stockpile-migrations-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "0001_fixture.sql"), sql);
  return directory;
}

function poolFor(client: MigrationClient): PgPoolLike {
  return {
    connect: async () => client,
    query: async <Row extends QueryResultRow = QueryResultRow>() => result<Row>(),
  };
}

describe("migrateDatabase", () => {
  it("applies a pending migration transactionally while holding the migration lock", async () => {
    const directory = await fixtureDirectory("CREATE TABLE fixture (id uuid PRIMARY KEY);\n");
    const client = new MigrationClient();

    const migrated = await migrateDatabase(poolFor(client), directory);

    expect(migrated.applied).toEqual(["0001_fixture.sql"]);
    expect(client.statements.some((statement) => statement.includes("CREATE TABLE fixture"))).toBe(true);
    expect(client.statements).toContain("BEGIN");
    expect(client.statements).toContain("COMMIT");
    expect(client.statements.at(0)).toContain("pg_advisory_lock");
    expect(client.statements.at(-1)).toContain("pg_advisory_unlock");
    expect(client.released).toBe(true);
  });

  it("rejects an edited migration that was already applied", async () => {
    const directory = await fixtureDirectory("SELECT 1;\n");
    const client = new MigrationClient([{ name: "0001_fixture.sql", checksum: "wrong" }]);

    await expect(migrateDatabase(poolFor(client), directory)).rejects.toThrow("checksum changed");
    expect(client.statements.at(-1)).toContain("pg_advisory_unlock");
    expect(client.released).toBe(true);
  });
});
