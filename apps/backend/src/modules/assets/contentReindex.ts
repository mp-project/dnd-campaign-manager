import type { AppModule } from "#core/app/moduleSystem";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/Setup";
import type { AssetsService } from "#src/modules/assets/service/AssetsService";

/**
 * A module that only hands out the assets service once every other module has registered its
 * content types, for the reindex script (`npm run content:reindex`) and its test.
 */
export function createContentReindexModule(
  modules: readonly AppModule[],
  onReady: (service: AssetsService) => void,
): AppModule {
  return {
    name: "content-reindex",
    dependencies: modules.map((module) => module.name),
    register: (_app, container) => {
      onReady(
        container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES).service,
      );
    },
  };
}
