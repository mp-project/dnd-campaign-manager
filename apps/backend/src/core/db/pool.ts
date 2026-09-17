import type { Pool } from "pg";
import { Pool as PgPool } from "pg";

export const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

export type ReadyState = {
  database: boolean;
  migrations: boolean;
};

export function createPgPool(connectionString: string): Pool {
  return new PgPool({
    connectionString,
    max: 10,
  });
}

export async function checkDatabaseReadiness(pool: Pool): Promise<ReadyState> {
  try {
    await pool.query("select 1");

    const migrationTableResult = await pool.query<{ exists: boolean }>(
      `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = $1
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
