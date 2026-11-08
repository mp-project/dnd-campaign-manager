import type { ContentView } from "#core/content/viewer";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { ContentAccess } from "#src/modules/assets/index";
import type { SpeciesSelectionDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type {
  ResponseSpeciesCreationOptionsDto,
  ResponseSpeciesFeaturesDto,
  ResponseSpeciesSelectionDto,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { NotFoundError } from "#core/error/http/index";
import { toPlayerGrants } from "#src/modules/species/domain/SpeciesDefinition";
import { readSpeciesDefinition } from "#src/modules/species/history/TrackedSpecies";
import type { SpeciesSelectionService } from "#src/modules/species/service/SpeciesSelectionService";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesReader } from "#src/modules/species/useCase/SpeciesReader";

const header = (readable: { found: { species: { id: string }; asset: { id: string } }; view: ContentView }) => ({
  speciesId: readable.found.species.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

/** Grants of the species and of every variant the reader may see, with their source. */
export class GetSpeciesFeaturesUseCase {
  constructor(private readonly reader: SpeciesReader) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; speciesId: string },
  ): Promise<ResponseSpeciesFeaturesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const variants = await this.reader.variants(readable);
    const isVisible = await this.reader.visibility(readable, variants);
    const sources = [
      {
        sourceType: "SPECIES" as const,
        sourceAssetId: readable.found.asset.id,
        grants: readSpeciesDefinition(readable.found.species).featureGrants,
      },
      ...variants.map(({ asset, featureGrants }) => ({
        sourceType: "SPECIES_VARIANT" as const,
        sourceAssetId: asset.id,
        grants: featureGrants,
      })),
    ];

    return {
      ...header(readable),
      grants: sources.flatMap(({ grants, ...source }) =>
        toPlayerGrants(grants, isVisible)
          .sort(
            (left, right) =>
              left.minimumCharacterLevel - right.minimumCharacterLevel ||
              left.displayOrder - right.displayOrder,
          )
          .map((grant) => ({ ...grant, ...source })),
      ),
    };
  }
}

/** Sizes, movement and the variant groups a character picks from. */
export class GetSpeciesCreationOptionsUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly selection: SpeciesSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; speciesId: string },
  ): Promise<ResponseSpeciesCreationOptionsDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const variants = await this.reader.variants(readable);
    const isVisible = await this.reader.visibility(readable, variants);

    return {
      ...header(readable),
      ...this.selection.getCreationOptions(
        readable.found,
        this.selection.offeredVariants(variants, isVisible),
      ),
    };
  }
}

/**
 * Checks a selection and resolves the grants that apply at the character level. Everybody who may
 * see the species in the campaign may ask, players included; nothing is stored.
 */
export class ResolveSpeciesSelectionUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly selection: SpeciesSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; speciesId: string; command: SpeciesSelectionDto },
  ): Promise<ResponseSpeciesSelectionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const variants = await this.reader.variants(readable);
    const isVisible = await this.reader.visibility(readable, variants);

    return {
      ...header(readable),
      ...(await this.selection.resolveSpeciesSelection(readable.found, {
        access: readable.access as ContentAccess,
        isVisible,
        offered: this.selection.offeredVariants(variants, isVisible),
        selection: input.command,
      })),
    };
  }
}

/**
 * Where a species is used in the current campaign: links and definitions that refer to it, such as
 * its variants. Players only see usages whose other end they may see as well. `ownOnly` limits it
 * to custom species, for the route under `/species`; the catalog route also answers for global
 * ones.
 */
export class GetSpeciesUsagesUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly speciesService: SpeciesService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; speciesId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);
    if (!readable.access) {
      throw new NotFoundError("Species not found");
    }

    return this.speciesService.getUsages(readable.access, readable.found.asset.id);
  }
}
