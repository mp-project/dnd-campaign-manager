import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpeciesVariantDto,
  type ResponseSpeciesVariantListDto,
  toSpeciesVariantFullResponse,
  toSpeciesVariantPlayerResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";
import type {
  ReadableSpecies,
  ReadableVariant,
  SpeciesReader,
  SpeciesReadMode,
} from "#src/modules/species/useCase/SpeciesReader";

async function toResponses(
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

/**
 * Variants of a species the reader may see, in display order. A species has few variants, so the
 * list is not paged.
 */
export class ListSpeciesVariantsUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly variantsService: SpeciesVariantsService,
    private readonly mode: SpeciesReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; speciesId: string },
  ): Promise<ResponseSpeciesVariantListDto> {
    const readable = await this.reader.read(context, this.mode, input);
    const variants = await this.reader.variants(readable);

    return { data: await toResponses(this.reader, this.variantsService, readable, variants) };
  }
}

/** One variant, if the reader may see it and its species. */
export class GetSpeciesVariantUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly variantsService: SpeciesVariantsService,
    private readonly mode: SpeciesReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; speciesId: string; variantId: string },
  ): Promise<ResponseSpeciesVariantDto> {
    const readable = await this.reader.read(context, this.mode, input);
    const variant = await this.reader.variant(readable, input.variantId);
    const [response] = await toResponses(this.reader, this.variantsService, readable, [variant]);

    return response as ResponseSpeciesVariantDto;
  }
}
