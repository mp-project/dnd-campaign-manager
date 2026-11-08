import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseUpdateTagDto,
  toTagFullResponse,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import type { UpdateTagDto } from "#src/modules/tags/domain/dto/UpdateTagDto";
import { TAG_ACTIONS } from "#src/modules/tags/history/TrackedTag";
import { TagsService } from "#src/modules/tags/service/TagsService";

export type UpdateTagInput = { campaignId: string; tagId: string; command: UpdateTagDto };

export class UpdateTagUseCase extends MutationUseCase<UpdateTagInput, ResponseUpdateTagDto> {
  protected readonly action = TAG_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateTagInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: UpdateTagInput,
  ): Promise<ResponseUpdateTagDto> {
    const { row, merged } = await this.tagsService.updateTag(scope, input);
    const usageCount = await this.tagsService.getUsageCount(row.id, scope.tx);

    return { ...toTagFullResponse(row, usageCount), merged };
  }
}
