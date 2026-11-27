import {
  type ResponseSpeciesVariantDto,
  toSpeciesVariantFullResponse,
  toSpeciesVariantPlayerResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";
import type {
  ReadableSpecies,
  ReadableVariant,
  SpeciesReader,
} from "#src/modules/species/useCase/SpeciesReader";

/** The variants in the reader's view: full records for the full view, player views otherwise. */
export async function toSpeciesVariantResponses(
  reader: SpeciesReader,
  variantsService: SpeciesVariantsService,
  readable: ReadableSpecies,
  variants: readonly ReadableVariant[],
): Promise<ResponseSpeciesVariantDto[]> {
  if (readable.view === "FULL") {
    const records = await variantsService.loadRecords(variantsService.db, variants);

    return records.map(toSpeciesVariantFullResponse);
  }

  const isVisible = await reader.visibility(readable, variants);

  return variants.map((variant) => toSpeciesVariantPlayerResponse(variant, isVisible));
}
