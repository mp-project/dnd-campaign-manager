import type { RequestContext } from "#core/http/requestContext";
import {
  ConflictError,
  NotFoundError,
  VersionConflictError,
} from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CorrectCampaignTimeDto } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";
import type { CampaignAggregate } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class CorrectCampaignTimeUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    input: CorrectCampaignTimeDto,
  ): Promise<CampaignAggregate> {
    const actorId = this.campaignsService.assertAuditableActorId(context);
    const current = await this.campaignsService.repository.findCampaignById(
      this.campaignsService.db,
      campaignId,
    );

    if (!current) {
      throw new NotFoundError("Campaign not found");
    }

    const membership = await this.campaignsService.repository.findMembership(
      this.campaignsService.db,
      campaignId,
      actorId,
    );
    const isOwner = current.ownerUserId === actorId;

    if (!isOwner && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Campaign not found");
    }

    if (current.status === "ARCHIVED") {
      throw new ConflictError("Archived campaigns cannot be modified");
    }

    return this.campaignsService.transactionManager.inTransaction(async (tx) => {
      const updated = await this.campaignsService.repository.updateTimeWithVersion(tx, {
        campaignId,
        actorId,
        expectedVersion: current.version,
        newGameDay: input.gameDay,
        newLongRestCount: input.longRestCount,
      });

      if (!updated) {
        throw new VersionConflictError("Campaign time correction version mismatch");
      }

      await this.campaignsService.repository.insertTimeEvent(tx, {
        actorId,
        campaignId,
        type: "CORRECTION",
        previousGameDay: current.currentGameDay,
        newGameDay: input.gameDay,
        previousLongRestCount: current.longRestCount,
        newLongRestCount: input.longRestCount,
        reason: input.reason,
      });

      const aggregate: CampaignAggregate = {
        campaign: updated,
        membership,
        isOwner: false,
        effectivePermissions: [],
      };

      return this.campaignsService.attachEffectivePermissions(context, aggregate);
    });
  }
}
