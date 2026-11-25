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
  await useCollisionFreeUserTagDefault();
}

// The column default draws a random six-digit tag, which the app never relies on
// (`generateUniqueUserTag` checks for duplicates). Tests insert users without a tag
// thousands of times per run, so random tags occasionally collide on the unique index
// and fail a test at random. A sequence keeps the format and never repeats.
async function useCollisionFreeUserTagDefault(): Promise<void> {
  await pool.query("CREATE SEQUENCE test_user_tag_seq START 900000 MAXVALUE 999999");
  await pool.query(
    `ALTER TABLE users ALTER COLUMN user_tag SET DEFAULT ('player#' || nextval('test_user_tag_seq')::text)`,
  );
}

// Rerunning all migrations can take longer than Jest's default 5 s on a freshly started database.
const REBUILD_TIMEOUT_MS = 30_000;

beforeAll(async () => {
  await rebuildTestDatabaseSchema();
}, REBUILD_TIMEOUT_MS);

beforeEach(async () => {
  await rebuildTestDatabaseSchema();
}, REBUILD_TIMEOUT_MS);

afterAll(async () => {
  await pool.end();
});
