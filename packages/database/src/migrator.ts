import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PgPoolLike } from "./pg-types.js";
import type { QueryResultRow } from "pg";

interface AppliedMigration extends QueryResultRow {
  readonly name: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

export async function migrateDatabase(
  pool: PgPoolLike,
  migrationsDirectory = resolve(process.cwd(), "packages/database/migrations"),
): Promise<MigrationResult> {
  const client = await pool.connect();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('stockpile:migrations'))");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
       )`,
    );
    const existingResult = await client.query<AppliedMigration>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    const existing = new Map(existingResult.rows.map((migration) => [migration.name, migration.checksum]));
    const names = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort();

    for (const name of names) {
      const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previousChecksum = existing.get(name);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== checksum) throw new Error(`Applied migration checksum changed: ${name}`);
        alreadyApplied.push(name);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
        await client.query("COMMIT");
        applied.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return Object.freeze({ applied: Object.freeze(applied), alreadyApplied: Object.freeze(alreadyApplied) });
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('stockpile:migrations'))");
    } finally {
      client.release();
    }
  }
}
