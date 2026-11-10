import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResolveBackgroundDto } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ResponseBackgroundResolutionDto } from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { BackgroundSelectionService } from "#src/modules/backgrounds/service/BackgroundSelectionService";
import type { BackgroundReader } from "#src/modules/backgrounds/useCase/BackgroundReader";

/**
 * Checks a character's choices for a background and previews what it gives (ability increases,
 * proficiencies, feats, resolved features, items and coins, profile suggestions), without storing
 * anything. Everybody who may see the background in the campaign may ask; players get the preview
 * of their player view.
 */
export class ResolveBackgroundUseCase {
  constructor(
    private readonly reader: BackgroundReader,
    private readonly selection: BackgroundSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; backgroundId: string; command: ResolveBackgroundDto },
  ): Promise<ResponseBackgroundResolutionDto> {
    const readable = await this.reader.read(context, "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Background not found");
    }

    return {
      backgroundId: readable.found.background.id,
      assetId: readable.found.asset.id,
      view: readable.view,
      ...(await this.selection.resolveBackground(readable.found, {
        access: readable.access,
        definition: readable.definition,
        command: input.command,
      })),
    };
  }
}
