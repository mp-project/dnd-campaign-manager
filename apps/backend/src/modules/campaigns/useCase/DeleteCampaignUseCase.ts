import type { RequestContext } from "#core/http/requestContext";
import {
  NotFoundError,
  VersionConflictError,
} from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class DeleteCampaignUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(context: RequestContext, campaignId: string): Promise<void> {
    const actorId = this.campaignsService.assertAuditableActorId(context);
    const current = await this.campaignsService.repository.findCampaignById(
      this.campaignsService.db,
      campaignId,
    );

    if (!current) {
      throw new NotFoundError("Campaign not found");
    }

    const isOwner = current.ownerUserId === actorId;

    if (!isOwner && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Campaign not found");
    }

    const archived = await this.campaignsService.repository.softArchiveWithVersion(
      this.campaignsService.db,
      {
        campaignId,
        actorId,
        expectedVersion: current.version,
      },
    );

    if (!archived) {
      throw new VersionConflictError("Campaign archive version mismatch");
    }
  }
}
