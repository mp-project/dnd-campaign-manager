import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { AppModule } from "#core/app/moduleSystem";
import type { AppDatabase } from "#core/db/pool";
import { assetReferences, assets } from "#core/db/schema";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";

/**
 * Stands in for content that uses assets, like the items an actor names, without its rules: they
 * are content of type `EVENT` that `usesContent`, so what they refer to stays in use while they are
 * not archived; `shownToPlayers` decides whether players may read them (and so see that use).
 */
export function createContentUse(db: AppDatabase) {
  let shownToPlayers = true;
  let counter = 0;

  const module: AppModule = {
    name: "test-content-use",
    dependencies: ["assets"],
    register: (_app, container) => {
      const { service } = container.dependencies.require<AssetsModuleDependencies>(
        ASSETS_MODULE_DEPENDENCIES,
      );

      service.registerContentType({
        assetType: "EVENT",
        kind: "STORY",
        editRoutes: () => new Map(),
        usesContent: true,
        playerView: { schema: z.object({}), load: async () => ({}) },
      });
      service.registerVisibilityProvider({
        name: "test-content-use",
        listVisibleAssetIds: async ({ campaignId }, tx) =>
          shownToPlayers
            ? (
                await tx
                  .select({ id: assets.id })
                  .from(assets)
                  .where(and(eq(assets.campaignId, campaignId), eq(assets.assetType, "EVENT")))
              ).map((row) => row.id)
            : [],
      });
    },
  };

  return {
    module,
    /** Active content of the campaign that uses the asset; returns its asset id. */
    async use(campaignId: string, targetAssetId: string): Promise<string> {
      counter += 1;

      const [user] = await db
        .insert(assets)
        .values({
          assetType: "EVENT",
          title: `User ${counter}`,
          slug: `test-user-${counter}`,
          status: "ACTIVE",
          scope: "CAMPAIGN",
          origin: "CUSTOM",
          campaignId,
        })
        .returning({ id: assets.id });

      await db.insert(assetReferences).values({
        sourceAssetId: user!.id,
        targetAssetId,
        path: "uses.0",
        kind: "USES",
        position: 0,
      });

      return user!.id;
    },
    showToPlayers(shown: boolean): void {
      shownToPlayers = shown;
    },
    reset(): void {
      shownToPlayers = true;
    },
  };
}
