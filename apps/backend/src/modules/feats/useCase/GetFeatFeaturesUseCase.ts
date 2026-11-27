import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseFeatFeaturesDto,
  toPlayerDefinition,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import {
  type FeatCatalogInput,
  type FeatReader,
  readableFeatHeader,
} from "#src/modules/feats/useCase/FeatReader";

/** The features the feat grants, upgrades or replaces. */
export class GetFeatFeaturesUseCase {
  constructor(private readonly reader: FeatReader) {}

  async execute(context: RequestContext, input: FeatCatalogInput): Promise<ResponseFeatFeaturesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    return { ...readableFeatHeader(readable), grants: toPlayerDefinition(definition, isVisible).featureGrants };
  }
}
