import { ConflictError, VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import type { UpdateCampaignDto } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class UpdateCampaignUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    input: UpdateCampaignDto,
  ): Promise<ResponseCampaignDto> {
    const { db, repository } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);
    const { campaign, membership } = await this.campaignsService.loadManagedCampaign(
      context,
      actorId,
      campaignId,
    );

    this.campaignsService.assertNotArchived(campaign);

    let updated;

    try {
      updated = await repository.update(db, {
        campaignId,
        actorId,
        expectedVersion: input.expectedVersion,
        patch: {
          name: input.name,
          slug: input.slug ? this.campaignsService.slugify(input.slug) : undefined,
          description: input.description,
          status: input.status,
          settings: input.settings,
        },
      });
    } catch (error) {
      if (this.campaignsService.isUniqueViolation(error)) {
        throw new ConflictError("Campaign slug is already in use for this owner");
      }

      throw error;
    }

    if (!updated) {
      throw new VersionConflictError("Campaign update version mismatch");
    }

    return toCampaignResponse(
      this.campaignsService.buildAggregate(context, updated, membership),
    );
  }
}
