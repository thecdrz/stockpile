import pg from "pg";

const configured = process.env.DATABASE_URL;
if (!configured) throw new Error("DATABASE_URL is required");
const target = new URL(configured);
if (!target.username || !target.pathname.slice(1)) throw new Error("DATABASE_URL must include a user and database");
if (!["127.0.0.1", "localhost"].includes(target.hostname)) {
  throw new Error("db:setup only provisions a database on this local machine");
}
const role = decodeURIComponent(target.username);
const password = decodeURIComponent(target.password);
const database = decodeURIComponent(target.pathname.slice(1));
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const admin = new pg.Client({ host: "/run/postgresql", database: "postgres", user: "postgres" });

try {
  await admin.connect();
  const roleResult = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
  if (roleResult.rowCount === 0) await admin.query(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD ${literal(password)}`);
  else await admin.query(`ALTER ROLE ${identifier(role)} LOGIN PASSWORD ${literal(password)}`);
  const databaseResult = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database]);
  if (databaseResult.rowCount === 0) await admin.query(`CREATE DATABASE ${identifier(database)} OWNER ${identifier(role)}`);
  else await admin.query(`ALTER DATABASE ${identifier(database)} OWNER TO ${identifier(role)}`);
  console.log(`Local PostgreSQL database ${database} is ready for role ${role}.`);
} finally {
  await admin.end();
}
