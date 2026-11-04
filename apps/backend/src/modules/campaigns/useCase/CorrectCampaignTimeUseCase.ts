import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { AppDatabase } from "#core/db/pool";
import type { RequestContext } from "#core/http/requestContext";
import type { CorrectCampaignTimeDto } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CAMPAIGN_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaign";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export type CorrectCampaignTimeInput = {
  campaignId: string;
  command: CorrectCampaignTimeDto;
};

export class CorrectCampaignTimeUseCase extends MutationUseCase<
  CorrectCampaignTimeInput,
  ResponseCampaignDto
> {
  protected readonly action = CAMPAIGN_ACTIONS.correctTime;

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
    input: CorrectCampaignTimeInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.campaignsService.assertCanManage(context, input.campaignId, db);

    return authorized();
  }

  protected override reasonOf(input: CorrectCampaignTimeInput): string | null {
    return input.command.reason;
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CorrectCampaignTimeInput,
  ): Promise<ResponseCampaignDto> {
    const { row } = await scope.change(
      this.campaignsService.trackedCampaign,
      input.campaignId,
      (current) => {
        this.campaignsService.assertNotArchived(current);

        return {
          set: {
            currentGameDay: input.command.gameDay,
            longRestCount: input.command.longRestCount,
          },
        };
      },
    );

    return toCampaignResponse(await this.campaignsService.toAggregate(scope.tx, context, row));
  }
}
