import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import type { FeatDefinition } from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import type { FeatWithAsset } from "#src/modules/feats/domain/repository/FeatsRepository";
import { readFeatDefinition } from "#src/modules/feats/history/TrackedFeat";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

/**
 * Where a feat is read: `campaign` only finds custom feats of the campaign, `catalog` also global
 * ones for the campaign ruleset, `system` only global ones.
 */
export type FeatReadMode = "campaign" | "catalog" | "system";

export type ReadableFeat = {
  found: FeatWithAsset;
  view: ContentView;
  /** Null outside a campaign. */
  access: ContentAccess | null;
};

/**
 * Finds a feat for a read route and decides the view. Owners, editors and administrators get the
 * full view, players the player view of active feats they may see; archived feats stay in the
 * catalog while the campaign still uses them. Outside a campaign, administrators get the full view
 * of global feats and everybody else the player view of active ones.
 */
export class FeatReader {
  constructor(
    private readonly featsService: FeatsService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: FeatReadMode,
    input: { campaignId?: string | undefined; featId: string },
  ): Promise<ReadableFeat> {
    const { db } = this.featsService;

    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.featsService.requireSystemFeat(db, input.featId);

      if (isSysAdminRole(context.systemRole)) {
        return { found, view: "FULL", access: null };
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Feat not found");
      }

      return { found, view: "PLAYER", access: null };
    }

    const access = await this.assetsService.access(context, input.campaignId as string);
    const found = await this.featsService.requireReadableFeat(
      access,
      input.featId,
      mode === "campaign" ? "MANAGE" : "CATALOG",
    );

    return { found, view: access.isFullView ? "FULL" : "PLAYER", access };
  }

  /** The stored definition (409 if it no longer parses) and what of it the reader may see. */
  async definition(
    readable: ReadableFeat,
  ): Promise<{ definition: FeatDefinition; isVisible: (assetId: string) => boolean }> {
    const definition = readFeatDefinition(readable.found.feat);

    if (readable.view === "FULL") {
      return { definition, isVisible: () => true };
    }

    return {
      definition,
      isVisible: await this.featsService.playerReferenceVisibility(
        this.featsService.db,
        definition,
        readable.access,
      ),
    };
  }
}
