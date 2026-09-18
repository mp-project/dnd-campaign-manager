import {
  createDrizzleDb,
  createPgPool,
  resetTestDatabase,
  runDatabaseMigrations,
} from "../../src/core/db/pool.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const pool = createPgPool(databaseUrl);
const db = createDrizzleDb(pool);

beforeAll(async () => {
  await runDatabaseMigrations(db);
  await resetTestDatabase(pool, databaseUrl);
});

beforeEach(async () => {
  await resetTestDatabase(pool, databaseUrl);
});

afterAll(async () => {
  await pool.end();
});
