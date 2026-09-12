import { Pool } from "pg";
import { migrateDatabase } from "./migrator.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString });
try {
  const result = await migrateDatabase(pool);
  process.stdout.write(
    `Database migrations complete: ${result.applied.length} applied, ${result.alreadyApplied.length} unchanged\n`,
  );
} finally {
  await pool.end();
}
