import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import pino from "pino";

import { createLogger } from "#core/log/logger";
import { runScript } from "#core/log/processErrors";
import { buildTestApp } from "#test/helpers/buildTestApp";

// The document may go to stdout, so log lines go to stderr. Needs no `.env`.
const logger = createLogger(
  { service: "openapi-export", level: "info", pretty: false, environment: "development" },
  pino.destination(2),
);

/**
 * Writes the OpenAPI document of all modules to the given file (default: stdout).
 * Builds the app like the unit tests do, so no database, storage or mail server is needed;
 * the frontend generates its API types from this file (`npm run api:types`).
 */
async function exportOpenApi(target: string | undefined): Promise<void> {
  const { app } = buildTestApp();

  try {
    await app.ready();
    const document = `${JSON.stringify(app.swagger(), null, 2)}\n`;

    if (!target) {
      process.stdout.write(document);
      return;
    }

    const path = resolve(process.cwd(), target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, document);
    logger.info({ path }, "OpenAPI document written");
  } finally {
    await app.close();
  }
}

void runScript(logger, "openapi-export", () => exportOpenApi(process.argv[2]));
