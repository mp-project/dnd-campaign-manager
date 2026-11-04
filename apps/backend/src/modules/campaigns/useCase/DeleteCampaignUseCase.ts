import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { AppDatabase } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import { CAMPAIGN_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaign";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export type DeleteCampaignInput = { campaignId: string };

/**
 * Archives the campaign; it stays readable with status ARCHIVED.
 */
export class DeleteCampaignUseCase extends MutationUseCase<DeleteCampaignInput, void> {
  protected readonly action = CAMPAIGN_ACTIONS.archive;

  constructor(
    history: HistoryPort,
    private readonly campaignsService: CampaignsService,
  ) {
    super(history);
  }

  protected override async prepare(context: RequestContext): Promise<void> {
    await this.campaignsService.requireActorId(context);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteCampaignInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.campaignsService.assertCanManage(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(scope: ActionScope, _context: RequestContext, input: DeleteCampaignInput) {
    await scope.change(this.campaignsService.trackedCampaign, input.campaignId, () => ({
      set: { status: "ARCHIVED" },
    }));
  }
}
