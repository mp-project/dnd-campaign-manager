import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import { TAG_ACTIONS } from "#src/modules/tags/history/TrackedTag";
import { TagsService } from "#src/modules/tags/service/TagsService";

export type DeleteTagInput = { campaignId: string; tagId: string; forceDetach: boolean };

/** Removes the tag and, on request, its assignments; assets themselves are never deleted. */
export class DeleteTagUseCase extends MutationUseCase<DeleteTagInput, void> {
  protected readonly action = TAG_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteTagInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteTagInput,
  ): Promise<void> {
    await this.tagsService.deleteTag(scope, input);
  }
}
