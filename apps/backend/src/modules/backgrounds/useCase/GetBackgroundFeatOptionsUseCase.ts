import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { BackgroundFeatOptionsDto } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ResponseBackgroundFeatOptionsDto } from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { BackgroundSelectionService } from "#src/modules/backgrounds/service/BackgroundSelectionService";
import type { BackgroundReader } from "#src/modules/backgrounds/useCase/BackgroundReader";

/**
 * The feats a character may take through the background's feat grants, without those it already
 * has or gets from the background (unless repeatable), so a duplicate is never offered. A POST,
 * because the character's feats travel in the body; nothing is stored.
 */
export class GetBackgroundFeatOptionsUseCase {
  constructor(
    private readonly reader: BackgroundReader,
    private readonly selection: BackgroundSelectionService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; backgroundId: string; command: BackgroundFeatOptionsDto },
  ): Promise<ResponseBackgroundFeatOptionsDto> {
    const readable = await this.reader.read(context, "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Background not found");
    }

    return {
      backgroundId: readable.found.background.id,
      assetId: readable.found.asset.id,
      view: readable.view,
      grants: await this.selection.featOptions({
        access: readable.access,
        definition: readable.definition,
        existingFeatAssetIds: input.command.existingFeatAssetIds,
      }),
    };
  }
}
