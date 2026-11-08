import type { ContentReadPurpose } from "#core/content/access";
import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
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

/** Campaign routes manage the campaign's own species; the catalog offers what it may choose. */
function readPurposeOf(mode: SpeciesReadMode): ContentReadPurpose {
  return mode === "campaign" ? "MANAGE" : "CATALOG";
}

/** A variant as a read returns it, with its grants parsed once for the whole request. */
export type ReadableVariant = SpeciesVariantWithAsset & { featureGrants: SpeciesFeatureGrant[] };

export type ReadableSpecies = {
  found: SpeciesWithAsset;
  mode: SpeciesReadMode;
  view: ContentView;
  isAdmin: boolean;
  /** Set inside a campaign; null for global species read outside of one. */
  access: ContentAccess | null;
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

      return { found, mode, view: isAdmin ? "FULL" : "PLAYER", isAdmin, access: null };
    }

    const access = await this.assetsService.access(context, input.campaignId as string);
    const found = await this.speciesService.requireReadableSpecies(
      access,
      input.speciesId,
      readPurposeOf(mode),
    );

    return { found, mode, view: access.viewer.view, isAdmin, access };
  }

  /**
   * Variants of the species the reader may see, ordered for display. Variants whose stored grants
   * no longer parse are left out, so one of them cannot break every read of the species; the
   * species' `validate` names them and they can still be changed or validated directly.
   */
  async variants(readable: ReadableSpecies): Promise<ReadableVariant[]> {
    const speciesId = readable.found.species.id;
    const variants =
      readable.access === null
        ? await this.variantsService.listSystem(speciesId, readable.isAdmin)
        : await this.variantsService.listReadable(
            readable.access,
            speciesId,
            readPurposeOf(readable.mode),
          );

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
      readable.access,
    );
  }
}
