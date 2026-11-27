import type { RequestContext } from "#core/http/requestContext";
import {
  type AssetsService,
  type ContentReadMode,
  type ReadableContent,
  readContent,
} from "#src/modules/assets/index";
import type { FeatDefinition } from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import type { FeatWithAsset } from "#src/modules/feats/domain/repository/FeatsRepository";
import { readFeatDefinition } from "#src/modules/feats/history/TrackedFeat";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

export type FeatReadMode = ContentReadMode;

export type ReadableFeat = ReadableContent<FeatWithAsset>;

/** A feat in the catalog of a campaign; the input of the catalog sections. */
export type FeatCatalogInput = { campaignId: string; featId: string };

/** The ids and the view every catalog section of a feat starts with. */
export const readableFeatHeader = (readable: ReadableFeat) => ({
  featId: readable.found.feat.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

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

    return readContent(this.assetsService, context, mode, input.campaignId, {
      global: () => this.featsService.requireSystemFeat(db, input.featId),
      readable: (access, purpose) => this.featsService.requireReadableFeat(access, input.featId, purpose),
      notFound: "Feat not found",
    });
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
