import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseFeatPrerequisitesDto,
  toPlayerDefinition,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import {
  type FeatCatalogInput,
  type FeatReader,
  readableFeatHeader,
} from "#src/modules/feats/useCase/FeatReader";

/** Minimum level, check mode and the prerequisite tree. */
export class GetFeatPrerequisitesUseCase {
  constructor(private readonly reader: FeatReader) {}

  async execute(context: RequestContext, input: FeatCatalogInput): Promise<ResponseFeatPrerequisitesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    return {
      ...readableFeatHeader(readable),
      minimumCharacterLevel: readable.found.feat.minimumCharacterLevel,
      prerequisiteCheckMode: readable.found.feat.prerequisiteCheckMode,
      prerequisites: toPlayerDefinition(definition, isVisible).prerequisites,
    };
  }
}
