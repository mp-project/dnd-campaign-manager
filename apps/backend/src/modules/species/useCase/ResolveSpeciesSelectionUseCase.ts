import type { RequestContext } from "#core/http/requestContext";
import type { ContentAccess } from "#src/modules/assets/index";
import type { SpeciesSelectionDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ResponseSpeciesSelectionDto } from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesSelectionService } from "#src/modules/species/service/SpeciesSelectionService";
import {
  readableSpeciesHeader,
  type SpeciesCatalogInput,
  type SpeciesReader,
} from "#src/modules/species/useCase/SpeciesReader";

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
    input: SpeciesCatalogInput & { command: SpeciesSelectionDto },
  ): Promise<ResponseSpeciesSelectionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const variants = await this.reader.variants(readable);
    const isVisible = await this.reader.visibility(readable, variants);

    return {
      ...readableSpeciesHeader(readable),
      ...(await this.selection.resolveSpeciesSelection(readable.found, {
        access: readable.access as ContentAccess,
        isVisible,
        offered: this.selection.offeredVariants(variants, isVisible),
        selection: input.command,
      })),
    };
  }
}
