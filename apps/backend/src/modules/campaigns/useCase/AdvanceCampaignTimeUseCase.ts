import { VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AdvanceCampaignTimeDto } from "#src/modules/campaigns/domain/dto/AdvanceCampaignTimeDto";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class AdvanceCampaignTimeUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    input: AdvanceCampaignTimeDto,
  ): Promise<ResponseCampaignDto> {
    const { repository, transactionManager } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);
    const { campaign: current, membership } = await this.campaignsService.loadManagedCampaign(
      context,
      actorId,
      campaignId,
    );

    this.campaignsService.assertNotArchived(current);

    const nextGameDay = current.currentGameDay + input.days;
    const nextLongRestCount = current.longRestCount + input.longRests;

    const updated = await transactionManager.inTransaction(async (tx) => {
      const result = await repository.updateTime(tx, {
        campaignId,
        actorId,
        expectedVersion: current.version,
        newGameDay: nextGameDay,
        newLongRestCount: nextLongRestCount,
      });

      if (!result) {
        throw new VersionConflictError("Campaign time update version mismatch");
      }

      await repository.createTimeEvent(tx, {
        actorId,
        campaignId,
        type: input.days > 0 ? "ADVANCE_DAYS" : "LONG_REST",
        previousGameDay: current.currentGameDay,
        newGameDay: nextGameDay,
        previousLongRestCount: current.longRestCount,
        newLongRestCount: nextLongRestCount,
        reason: input.reason,
      });

      return result;
    });

    return toCampaignResponse(
      this.campaignsService.buildAggregate(context, updated, membership),
    );
  }
}
