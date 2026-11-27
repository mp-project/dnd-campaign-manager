import type { RequestContext } from "#core/http/requestContext";
import type { ResponseSpeciesVariantDto } from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";
import type { SpeciesReader, SpeciesReadMode } from "#src/modules/species/useCase/SpeciesReader";
import { toSpeciesVariantResponses } from "#src/modules/species/useCase/SpeciesVariantResponses";

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
    const [response] = await toSpeciesVariantResponses(this.reader, this.variantsService, readable, [variant]);

    return response as ResponseSpeciesVariantDto;
  }
}
