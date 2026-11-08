import { fileURLToPath } from "node:url";

import { buildApp } from "#src/app";
import { createContentReindexModule } from "#src/modules/assets/contentReindex";
import type { AssetsService } from "#src/modules/assets/service/AssetsService";
import { defaultAppModules } from "#src/modules/index";

/**
 * Builds `asset_references` again from the stored content, e.g. after a migration or when it might
 * be out of step. Safe to run at any time; each asset is rebuilt in its own transaction.
 */
async function runReindex(): Promise<void> {
  let assets: AssetsService | undefined;
  const app = buildApp({
    modules: [
      ...defaultAppModules,
      createContentReindexModule(defaultAppModules, (service) => {
        assets = service;
      }),
    ],
  });

  try {
    await app.ready();

    const count = await (assets as AssetsService).rebuildReferences();

    console.info(`Content references rebuilt for ${count} assets.`);
  } finally {
    await app.close();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runReindex();
}
