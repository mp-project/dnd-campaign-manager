import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResolveFeatDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ResponseFeatResolutionDto } from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatSelectionService } from "#src/modules/feats/service/FeatSelectionService";
import {
  type FeatCatalogInput,
  type FeatReader,
  readableFeatHeader,
} from "#src/modules/feats/useCase/FeatReader";

/** Checks choices and resolves the granted features; nothing is stored. */
export class ResolveFeatUseCase {
  constructor(
    private readonly reader: FeatReader,
    private readonly selection: FeatSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: FeatCatalogInput & { command: ResolveFeatDto },
  ): Promise<ResponseFeatResolutionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    if (!readable.access) {
      throw new NotFoundError("Feat not found");
    }

    return {
      ...readableFeatHeader(readable),
      ...(await this.selection.resolveFeat(readable.found, {
        access: readable.access,
        definition,
        isVisible,
        command: input.command,
      })),
    };
  }
}
