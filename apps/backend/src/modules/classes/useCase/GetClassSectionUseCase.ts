import type { RequestContext } from "#core/http/requestContext";
import {
  type ClassSection,
  type ResponseClassSectionDto,
  toClassSectionResponse,
  toPlayerDefinition,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import { parseClassDefinition } from "#src/modules/classes/history/TrackedClass";
import type { ClassReader } from "#src/modules/classes/useCase/ClassReader";

/**
 * One section of a class in the campaign catalog (progression, features, choices …). One instance
 * per section; players get the section of their player view.
 */
export class GetClassSectionUseCase {
  constructor(
    private readonly reader: ClassReader,
    private readonly section: ClassSection,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; classId: string },
  ): Promise<ResponseClassSectionDto> {
    const { found, view, isVisible } = await this.reader.read(context, "catalog", input);
    const definition = parseClassDefinition(found.characterClass);

    return toClassSectionResponse(
      this.section,
      found,
      view,
      view === "PLAYER" ? toPlayerDefinition(definition, isVisible) : definition,
    );
  }
}
