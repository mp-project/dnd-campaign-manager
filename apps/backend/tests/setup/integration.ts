import { createPgPool } from "../../src/core/db/pool.js";

const pool = createPgPool(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
);

beforeAll(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_runtime_state (
      id uuid PRIMARY KEY,
      state_key text NOT NULL,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL,
      created_by uuid NULL,
      updated_by uuid NULL
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS system_runtime_state_state_key_active_unique_idx
      ON system_runtime_state (state_key)
      WHERE deleted_at IS NULL;
  `);
});

afterAll(async () => {
  await pool.end();
});
