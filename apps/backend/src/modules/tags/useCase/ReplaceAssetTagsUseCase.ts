import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseReplaceAssetTagsDto,
  toTagFullResponse,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import type { ReplaceAssetTagsDto } from "#src/modules/tags/domain/dto/UpdateTagDto";
import { ASSET_TAGS_ACTION } from "#src/modules/tags/history/TrackedTag";
import { TagsService } from "#src/modules/tags/service/TagsService";

export type ReplaceAssetTagsInput = {
  campaignId: string;
  assetId: string;
  command: ReplaceAssetTagsDto;
};

export class ReplaceAssetTagsUseCase extends MutationUseCase<
  ReplaceAssetTagsInput,
  ResponseReplaceAssetTagsDto
> {
  protected readonly action = ASSET_TAGS_ACTION;

  constructor(
    history: HistoryPort,
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: ReplaceAssetTagsInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ReplaceAssetTagsInput,
  ): Promise<ResponseReplaceAssetTagsDto> {
    const { row, merged } = await this.tagsService.replaceAssignments(scope, {
      campaignId: input.campaignId,
      assetId: input.assetId,
      tagIds: input.command.tagIds,
      expectedVersion: input.command.expectedVersion,
    });
    const { repository } = this.tagsService;
    const tags = await repository.listForAsset(scope.tx, row.id);
    const usage = await repository.countUsages(
      scope.tx,
      tags.map((tag) => tag.id),
    );

    return {
      view: "FULL",
      assetId: row.id,
      assetVersion: row.version,
      tags: tags.map((tag) => toTagFullResponse(tag, usage.get(tag.id) ?? 0)),
      merged,
    };
  }
}
