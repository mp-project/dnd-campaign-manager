import type { RequestContext } from "#core/http/requestContext";
import {
  ConflictError,
  NotFoundError,
  VersionConflictError,
} from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import type { UpdateCampaignDto } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import type { CampaignAggregate } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class UpdateCampaignUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    input: UpdateCampaignDto,
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
    const canAdminOverride = isSysAdminRole(context.systemRole);

    if (!isOwner && !canAdminOverride) {
      throw new NotFoundError("Campaign not found");
    }

    if (current.status === "ARCHIVED") {
      throw new ConflictError("Archived campaigns cannot be modified");
    }

    const nextSlug = input.slug ?? current.slug;

    let updated;

    try {
      updated = await this.campaignsService.repository.updateCampaignWithVersion(
        this.campaignsService.db,
        {
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
        },
      );
    } catch (error) {
      if (this.campaignsService.isUniqueViolation(error)) {
        throw new ConflictError("Campaign slug is already in use for this owner");
      }

      throw error;
    }

    if (!updated) {
      throw new VersionConflictError("Campaign update version mismatch");
    }

    if (!nextSlug) {
      throw new ConflictError("Campaign slug cannot be empty");
    }

    const aggregate: CampaignAggregate = {
      campaign: updated,
      membership,
      isOwner: false,
      effectivePermissions: [],
    };

    return this.campaignsService.attachEffectivePermissions(context, aggregate);
  }
}
