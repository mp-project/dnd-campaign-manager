import type { RequestContext } from "#core/http/requestContext";
import type {
  ResponseSpeciesVariantListDto,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";
import type { SpeciesReader, SpeciesReadMode } from "#src/modules/species/useCase/SpeciesReader";
import { toSpeciesVariantResponses } from "#src/modules/species/useCase/SpeciesVariantResponses";

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

    return { data: await toSpeciesVariantResponses(this.reader, this.variantsService, readable, variants) };
  }
}
