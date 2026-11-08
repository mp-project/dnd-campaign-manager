import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { CreateTagDto } from "#src/modules/tags/domain/dto/CreateTagDto";
import {
  type ResponseTagFullDto,
  toTagFullResponse,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import { TAG_ACTIONS } from "#src/modules/tags/history/TrackedTag";
import { TagsService } from "#src/modules/tags/service/TagsService";

export type CreateTagInput = { campaignId: string; command: CreateTagDto };

export class CreateTagUseCase extends MutationUseCase<CreateTagInput, ResponseTagFullDto> {
  protected readonly action = TAG_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateTagInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: CreateTagInput,
  ): Promise<ResponseTagFullDto> {
    return toTagFullResponse(
      await this.tagsService.createTag(scope, { campaignId: input.campaignId }, input.command),
      0,
    );
  }
}
