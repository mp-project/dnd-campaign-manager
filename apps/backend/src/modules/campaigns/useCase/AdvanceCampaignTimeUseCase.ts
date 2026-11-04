import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { AppDatabase } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import type { AdvanceCampaignTimeDto } from "#src/modules/campaigns/domain/dto/AdvanceCampaignTimeDto";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CAMPAIGN_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaign";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export type AdvanceCampaignTimeInput = {
  campaignId: string;
  command: AdvanceCampaignTimeDto;
};

export class AdvanceCampaignTimeUseCase extends MutationUseCase<
  AdvanceCampaignTimeInput,
  ResponseCampaignDto
> {
  protected readonly action = CAMPAIGN_ACTIONS.advanceTime;

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
    input: AdvanceCampaignTimeInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.campaignsService.assertCanManage(context, input.campaignId, db);

    return authorized();
  }

  protected override reasonOf(input: AdvanceCampaignTimeInput): string | null {
    return input.command.reason;
  }

  /** Counts up from the locked row, so parallel requests add up instead of conflicting. */
  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: AdvanceCampaignTimeInput,
  ): Promise<ResponseCampaignDto> {
    const { row } = await scope.change(
      this.campaignsService.trackedCampaign,
      input.campaignId,
      (current) => {
        this.campaignsService.assertNotArchived(current);

        return {
          inc: { currentGameDay: input.command.days, longRestCount: input.command.longRests },
        };
      },
    );

    return toCampaignResponse(await this.campaignsService.toAggregate(scope.tx, context, row));
  }
}
