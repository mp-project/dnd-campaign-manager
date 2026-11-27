import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseFeatChoicesDto,
  toPlayerDefinition,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import {
  type FeatCatalogInput,
  type FeatReader,
  readableFeatHeader,
} from "#src/modules/feats/useCase/FeatReader";

/** Repeatability and the choices the character makes when taking the feat. */
export class GetFeatChoicesUseCase {
  constructor(private readonly reader: FeatReader) {}

  async execute(context: RequestContext, input: FeatCatalogInput): Promise<ResponseFeatChoicesDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);
    const view = toPlayerDefinition(definition, isVisible);

    return { ...readableFeatHeader(readable), repeatability: view.repeatability, choices: view.choices };
  }
}
