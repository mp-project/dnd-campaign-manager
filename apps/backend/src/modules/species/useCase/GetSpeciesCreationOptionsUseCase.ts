import type { RequestContext } from "#core/http/requestContext";
import type { ResponseSpeciesCreationOptionsDto } from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesSelectionService } from "#src/modules/species/service/SpeciesSelectionService";
import {
  readableSpeciesHeader,
  type SpeciesCatalogInput,
  type SpeciesReader,
} from "#src/modules/species/useCase/SpeciesReader";

/** Sizes, movement and the variant groups a character picks from. */
export class GetSpeciesCreationOptionsUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly selection: SpeciesSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: SpeciesCatalogInput,
  ): Promise<ResponseSpeciesCreationOptionsDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const variants = await this.reader.variants(readable);
    const isVisible = await this.reader.visibility(readable, variants);

    return {
      ...readableSpeciesHeader(readable),
      ...this.selection.getCreationOptions(
        readable.found,
        this.selection.offeredVariants(variants, isVisible),
      ),
    };
  }
}
