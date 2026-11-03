import { VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

/**
 * Archives the campaign; it stays readable with status ARCHIVED.
 */
export class DeleteCampaignUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(context: RequestContext, campaignId: string): Promise<void> {
    const { db, repository } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);
    const { campaign } = await this.campaignsService.loadManagedCampaign(
      context,
      actorId,
      campaignId,
    );

    const archived = await repository.delete(db, {
      campaignId,
      actorId,
      expectedVersion: campaign.version,
    });

    if (!archived) {
      throw new VersionConflictError("Campaign archive version mismatch");
    }
  }
}
