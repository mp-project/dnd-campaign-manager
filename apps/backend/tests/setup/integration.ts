import {
  assertSafeTestDatabaseUrl,
  createDrizzleDb,
  createPgPool,
  resetTestDatabase,
  runDatabaseMigrations,
} from "#core/db/pool";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const pool = createPgPool(databaseUrl);
const db = createDrizzleDb(pool);

async function rebuildTestDatabaseSchema(): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);

  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("CREATE SCHEMA drizzle");

  await runDatabaseMigrations(db);
  await resetTestDatabase(pool, databaseUrl);
}

beforeAll(async () => {
  await rebuildTestDatabaseSchema();
});

beforeEach(async () => {
  await rebuildTestDatabaseSchema();
});

afterAll(async () => {
  await pool.end();
});
