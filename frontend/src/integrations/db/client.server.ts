/**
 * Server-only DuckDB connection.
 *
 * One process-wide DuckDBInstance + DuckDBConnection, opened lazily on first
 * use and reused for every server-function invocation. The DB file lives at
 * `customer_data/app.duckdb` relative to the repo root.
 *
 * Schema is bootstrapped (with seed data) on first open; the queries are
 * idempotent (`CREATE TABLE IF NOT EXISTS`) so subsequent boots are no-ops.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { REGION_SEED, SCHEMA_SQL, SEEDS } from "./schema";

type SqlValue = string | number | bigint | boolean | null;

let connectionPromise: Promise<DuckDBConnection> | null = null;

function dbFilePath(): string {
  // The frontend dev server runs from `frontend/`, so the repo root is one
  // level up. Allow override via env for production builds.
  const override = process.env.UNMAPPED_DB_PATH;
  if (override) return override;

  const repoRoot = path.resolve(process.cwd(), "..");
  const dir = path.join(repoRoot, "customer_data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "app.duckdb");
}

async function bootstrap(conn: DuckDBConnection): Promise<void> {
  await conn.run(SCHEMA_SQL);

  for (const seed of SEEDS) {
    const reader = await conn.runAndReadAll(seed.countSql);
    const rows = reader.getRowObjectsJS() as Array<{ n: number | bigint }>;
    const count = Number(rows[0]?.n ?? 0);
    if (count === 0) await conn.run(seed.insertSql);
  }

  const regionsReader = await conn.runAndReadAll("SELECT COUNT(*) AS n FROM regions");
  const regionRows = regionsReader.getRowObjectsJS() as Array<{ n: number | bigint }>;
  if (Number(regionRows[0]?.n ?? 0) === 0) {
    await conn.run("BEGIN TRANSACTION");
    try {
      const stmt = await conn.prepare(
        "INSERT INTO regions (id, name, country_code) VALUES ($id, $name, $code)",
      );
      for (const [name, code] of REGION_SEED) {
        stmt.bind({
          id: crypto.randomUUID(),
          name,
          code,
        });
        await stmt.run();
      }
      await conn.run("COMMIT");
    } catch (err) {
      await conn.run("ROLLBACK");
      throw err;
    }
  }
}

/**
 * Returns the shared DuckDB connection, opening + bootstrapping it if needed.
 * Safe to call concurrently — the underlying promise is cached so only one
 * boot ever runs.
 */
export function getDb(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const instance = await DuckDBInstance.create(dbFilePath());
      const conn = await instance.connect();
      await bootstrap(conn);
      return conn;
    })().catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

/**
 * Run a SQL query and return rows as plain JS objects.
 * Uses named parameters (`$name`) — callers pass `{ name: value }`.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, SqlValue>,
): Promise<T[]> {
  const conn = await getDb();
  const reader = await conn.runAndReadAll(sql, params as never);
  return reader.getRowObjectsJS() as T[];
}

/**
 * Run a SQL statement that returns at most one row (or none). Convenience
 * wrapper around `query` that returns `null` when empty.
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, SqlValue>,
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Run a SQL statement that doesn't need to return rows (INSERT/UPDATE/DELETE).
 */
export async function execute(sql: string, params?: Record<string, SqlValue>): Promise<void> {
  const conn = await getDb();
  await conn.run(sql, params as never);
}
