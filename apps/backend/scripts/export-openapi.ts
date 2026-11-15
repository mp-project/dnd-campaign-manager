import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { buildTestApp } from "#test/helpers/buildTestApp";

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
    console.info(`OpenAPI document written to ${path}`);
  } finally {
    await app.close();
  }
}

exportOpenApi(process.argv[2]).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
