import type { RequestContext } from "#core/http/requestContext";
import type { EligibilityCheckDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ResponseFeatEligibilityDto } from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatSelectionService } from "#src/modules/feats/service/FeatSelectionService";
import {
  type FeatCatalogInput,
  type FeatReader,
  readableFeatHeader,
} from "#src/modules/feats/useCase/FeatReader";

/**
 * Whether a character described by a snapshot may take the feat. Everybody who may see the feat in
 * the campaign may ask, players included; nothing is stored.
 */
export class CheckFeatEligibilityUseCase {
  constructor(
    private readonly reader: FeatReader,
    private readonly selection: FeatSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: FeatCatalogInput & { command: EligibilityCheckDto },
  ): Promise<ResponseFeatEligibilityDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);

    return {
      ...readableFeatHeader(readable),
      ...this.selection.checkEligibility(readable.found, definition, input.command, isVisible),
    };
  }
}
