import type { RequestContext } from "#core/http/requestContext";
import { toPlayerGrants } from "#src/modules/species/domain/SpeciesDefinition";
import type { ResponseSpeciesFeaturesDto } from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import { readSpeciesDefinition } from "#src/modules/species/history/TrackedSpecies";
import {
  readableSpeciesHeader,
  type SpeciesCatalogInput,
  type SpeciesReader,
} from "#src/modules/species/useCase/SpeciesReader";

/** Grants of the species and of every variant the reader may see, with their source. */
export class GetSpeciesFeaturesUseCase {
  constructor(private readonly reader: SpeciesReader) {}

  async execute(
    context: RequestContext,
    input: SpeciesCatalogInput,
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
      ...readableSpeciesHeader(readable),
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
