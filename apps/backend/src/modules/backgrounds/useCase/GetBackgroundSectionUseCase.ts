import type { RequestContext } from "#core/http/requestContext";
import {
  type BackgroundSection,
  type ResponseBackgroundSectionDto,
  toBackgroundSectionResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { BackgroundReader } from "#src/modules/backgrounds/useCase/BackgroundReader";

/**
 * One section of a background in the campaign catalog (abilities, proficiencies, feats, features,
 * equipment, prompts). One instance per section; players get the section of their player view.
 */
export class GetBackgroundSectionUseCase {
  constructor(
    private readonly reader: BackgroundReader,
    private readonly section: BackgroundSection,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; backgroundId: string },
  ): Promise<ResponseBackgroundSectionDto> {
    const { found, view, definition } = await this.reader.read(context, "catalog", input);

    return toBackgroundSectionResponse(this.section, found, view, definition);
  }
}
