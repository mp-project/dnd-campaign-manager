import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import type { Pool } from "pg";
import { Pool as PgPool } from "pg";
import { fileURLToPath } from "node:url";

import * as schema from "#core/db/schema";

export const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";
const backendRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultMigrationsFolder = path.join(
  backendRootDir,
  "drizzle",
  "migrations",
);

export type ReadyState = {
  database: boolean;
  migrations: boolean;
};

export type AppDatabase = NodePgDatabase<typeof schema>;

export type TransactionManager = {
  inTransaction<T>(work: (db: AppDatabase) => Promise<T>): Promise<T>;
};

/**
 * Creates a PostgreSQL pool with conservative defaults for backend workloads.
 *
 * @param connectionString PostgreSQL connection URL.
 * @returns Configured pg Pool instance.
 */
export function createPgPool(connectionString: string): Pool {
  return new PgPool({
    connectionString,
    max: 10,
  });
}

/**
 * Creates the Drizzle database facade bound to the shared schema.
 *
 * @param pool PostgreSQL pool used by Drizzle.
 * @returns Typed AppDatabase instance.
 */
export function createDrizzleDb(pool: Pool): AppDatabase {
  return drizzle(pool, { schema });
}

/**
 * Executes all pending Drizzle migrations.
 *
 * @param db Database instance used for migrations.
 * @param migrationsFolder Optional migration directory override.
 * @returns Promise resolved after migrations complete.
 */
export async function runDatabaseMigrations(
  db: AppDatabase,
  migrationsFolder: string = defaultMigrationsFolder,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}

/**
 * Guards destructive test-db operations against non-test or non-local targets.
 *
 * @param databaseUrl Database URL to validate.
 */
export function assertSafeTestDatabaseUrl(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, "");
  const normalizedHost = url.hostname.toLowerCase();
  const isLocalHost =
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "localhost" ||
    normalizedHost === "db-test";
  const looksLikeTestDatabase = /(^|[_-])test([_-]|$)/i.test(databaseName);

  if (!looksLikeTestDatabase || !isLocalHost) {
    throw new Error(
      "Refusing test database operation for non-test DATABASE_URL.",
    );
  }
}

/**
 * Truncates public tables (excluding migration metadata) for test database reset.
 *
 * @param pool PostgreSQL pool connected to the test database.
 * @param databaseUrl Database URL used for safety validation.
 * @returns Promise resolved when reset has completed.
 */
export async function resetTestDatabase(
  pool: Pool,
  databaseUrl: string,
): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);

  const tablesResult = await pool.query<{ table_name: string }>(
    `
      select tablename as table_name
      from pg_tables
      where schemaname = 'public'
        and tablename <> $1
    `,
    [DRIZZLE_MIGRATIONS_TABLE],
  );

  if (tablesResult.rows.length === 0) {
    return;
  }

  const tableList = tablesResult.rows
    .map(({ table_name }) => `"public"."${table_name.replace(/"/g, '""')}"`)
    .join(", ");

  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

/**
 * Builds a transaction manager wrapper around Drizzle transactions.
 *
 * @param db Database instance.
 * @returns Transaction manager with inTransaction helper.
 */
export function createTransactionManager(db: AppDatabase): TransactionManager {
  return {
    async inTransaction<T>(work: (txDb: AppDatabase) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => work(tx as unknown as AppDatabase));
    },
  };
}

/**
 * Probes database connectivity and migration table existence for readiness checks.
 *
 * @param pool PostgreSQL pool.
 * @returns Readiness state for DB connectivity and migration status.
 */
export async function checkDatabaseReadiness(pool: Pool): Promise<ReadyState> {
  try {
    await pool.query("select 1");

    const migrationTableResult = await pool.query<{ exists: boolean }>(
      `
      select exists (
        select 1
        from information_schema.tables
        where table_name = $1
          and table_schema not in ('pg_catalog', 'information_schema')
      ) as exists;
      `,
      [DRIZZLE_MIGRATIONS_TABLE],
    );

    return {
      database: true,
      migrations: migrationTableResult.rows[0]?.exists ?? false,
    };
  } catch {
    return {
      database: false,
      migrations: false,
    };
  }
}
