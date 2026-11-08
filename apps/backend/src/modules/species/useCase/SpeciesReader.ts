import type { ContentView, ContentViewer } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import type { SpeciesFeatureGrant } from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import type {
  SpeciesVariantWithAsset,
  SpeciesWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import {
  readSpeciesDefinition,
  tryParseVariantGrants,
} from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";

/**
 * Where a species is read: `campaign` only finds custom species of the campaign, `catalog` also
 * global ones for the campaign ruleset, `system` only global ones.
 */
export type SpeciesReadMode = "campaign" | "catalog" | "system";

/** A variant as a read returns it, with its grants parsed once for the whole request. */
export type ReadableVariant = SpeciesVariantWithAsset & { featureGrants: SpeciesFeatureGrant[] };

export type ReadableSpecies = {
  found: SpeciesWithAsset;
  mode: SpeciesReadMode;
  view: ContentView;
  isAdmin: boolean;
  /** Set inside a campaign; null for global species read outside of one. */
  campaign: {
    viewer: ContentViewer;
    visibleAssetIds: ReadonlySet<string>;
    inUseAssetIds: ReadonlySet<string>;
  } | null;
};

/**
 * Finds a species for a read route and decides the view. GMs and editors get the full view of what
 * the campaign may use, players the player view of active species they may see. Archived species
 * stay in the catalog while the campaign still uses them. Outside a campaign, administrators get
 * the full view of global species and everybody else the player view of active ones. Variants
 * follow the same rules and are only reachable through a readable species.
 */
export class SpeciesReader {
  constructor(
    private readonly speciesService: SpeciesService,
    private readonly variantsService: SpeciesVariantsService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: SpeciesReadMode,
    input: { campaignId?: string | undefined; speciesId: string },
  ): Promise<ReadableSpecies> {
    const { db } = this.speciesService;
    const isAdmin = isSysAdminRole(context.systemRole);

    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.speciesService.requireSystemSpecies(db, input.speciesId);

      if (!isAdmin && found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Species not found");
      }

      return { found, mode, view: isAdmin ? "FULL" : "PLAYER", isAdmin, campaign: null };
    }

    const viewer = await this.assetsService.resolveCampaignViewer(
      context,
      input.campaignId as string,
    );
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    // GMs managing their own species see archived ones anyway; only the catalog and players need
    // to know which archived content the campaign still uses.
    const inUseAssetIds =
      mode !== "campaign" || viewer.view === "PLAYER"
        ? await this.assetsService.listInUseAssetIds(viewer.campaignId)
        : new Set<string>();
    const found = await this.speciesService.requireCatalogSpecies(viewer, input.speciesId, {
      visibleAssetIds,
      inUseAssetIds,
      // GMs manage their own archived species; the catalog only keeps those still in use.
      archived: mode === "campaign" ? "always" : "ifInUse",
    });

    if (mode === "campaign" && found.species.campaignId !== viewer.campaignId) {
      throw new NotFoundError("Species not found");
    }

    return {
      found,
      mode,
      view: viewer.view,
      isAdmin,
      campaign: { viewer, visibleAssetIds, inUseAssetIds },
    };
  }

  /**
   * Variants of the species the reader may see, ordered for display. Variants whose stored grants
   * no longer parse are left out, so one of them cannot break every read of the species; the
   * species' `validate` names them and they can still be changed or validated directly.
   */
  async variants(readable: ReadableSpecies): Promise<ReadableVariant[]> {
    const speciesId = readable.found.species.id;
    const variants =
      readable.campaign === null
        ? await this.variantsService.listSystem(speciesId, readable.isAdmin)
        : await this.variantsService.listAvailable(readable.campaign.viewer, speciesId, {
            visibleAssetIds: readable.campaign.visibleAssetIds,
            inUseAssetIds: readable.campaign.inUseAssetIds,
            archived: readable.mode === "campaign" ? "always" : "ifInUse",
          });

    return variants.flatMap((item) => {
      const featureGrants = tryParseVariantGrants(item.variant);

      return featureGrants === null ? [] : [{ ...item, featureGrants }];
    });
  }

  /** One variant of the species, if the reader may see it; otherwise 404. */
  async variant(readable: ReadableSpecies, variantId: string): Promise<ReadableVariant> {
    const found = (await this.variants(readable)).find((item) => item.variant.id === variantId);

    if (!found) {
      throw new NotFoundError("Variant not found");
    }

    return found;
  }

  /**
   * Which referenced assets of the species and these variants the reader may see; everything for
   * GMs. Outside a campaign players only see active global assets.
   */
  async visibility(
    readable: ReadableSpecies,
    variants: readonly ReadableVariant[],
  ): Promise<(assetId: string) => boolean> {
    if (readable.view === "FULL") {
      return () => true;
    }

    const grantLists = [
      readSpeciesDefinition(readable.found.species).featureGrants,
      ...variants.map(({ featureGrants }) => featureGrants),
    ];

    return this.speciesService.playerReferenceVisibility(
      this.speciesService.db,
      grantLists,
      readable.campaign?.visibleAssetIds ?? new Set(),
      readable.campaign?.inUseAssetIds ?? new Set(),
    );
  }
}
