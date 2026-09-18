import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const backendRootDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRootDir = path.resolve(backendRootDir, "../..");

loadEnv({ path: path.join(backendRootDir, ".env"), quiet: true });
loadEnv({ path: path.join(backendRootDir, ".env.local"), quiet: true });
loadEnv({ path: path.join(workspaceRootDir, ".env"), quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/dnd_campaign_manager",
  },
  strict: true,
  verbose: true,
});
