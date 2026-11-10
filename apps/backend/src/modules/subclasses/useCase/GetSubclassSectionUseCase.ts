import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSubclassSectionDto,
  type SubclassSection,
  toSubclassSectionResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { SubclassReader } from "#src/modules/subclasses/useCase/SubclassReader";

/**
 * One section of a subclass in the campaign catalog (progression, features, choices,
 * spellcasting). One instance per section; players get the section of their player view.
 */
export class GetSubclassSectionUseCase {
  constructor(
    private readonly reader: SubclassReader,
    private readonly section: SubclassSection,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; subclassId: string },
  ): Promise<ResponseSubclassSectionDto> {
    const { found, view, definition } = await this.reader.read(context, "catalog", input);

    return toSubclassSectionResponse(this.section, found, view, definition);
  }
}
