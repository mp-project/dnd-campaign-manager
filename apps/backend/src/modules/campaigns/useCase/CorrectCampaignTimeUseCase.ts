import { VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { CorrectCampaignTimeDto } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class CorrectCampaignTimeUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    input: CorrectCampaignTimeDto,
  ): Promise<ResponseCampaignDto> {
    const { repository, transactionManager } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);
    const { campaign: current, membership } = await this.campaignsService.loadManagedCampaign(
      context,
      actorId,
      campaignId,
    );

    this.campaignsService.assertNotArchived(current);

    const updated = await transactionManager.inTransaction(async (tx) => {
      const result = await repository.updateTime(tx, {
        campaignId,
        actorId,
        expectedVersion: current.version,
        newGameDay: input.gameDay,
        newLongRestCount: input.longRestCount,
      });

      if (!result) {
        throw new VersionConflictError("Campaign time correction version mismatch");
      }

      await repository.createTimeEvent(tx, {
        actorId,
        campaignId,
        type: "CORRECTION",
        previousGameDay: current.currentGameDay,
        newGameDay: input.gameDay,
        previousLongRestCount: current.longRestCount,
        newLongRestCount: input.longRestCount,
        reason: input.reason,
      });

      return result;
    });

    return toCampaignResponse(
      this.campaignsService.buildAggregate(context, updated, membership),
    );
  }
}
