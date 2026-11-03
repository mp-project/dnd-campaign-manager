import { ConflictError, UnauthenticatedError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CreateCampaignDto } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class CreateCampaignUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    input: CreateCampaignDto,
  ): Promise<ResponseCampaignDto> {
    const { repository, transactionManager, usersDependencies, rulesetDependencies } =
      this.campaignsService;
    const { ownerUserId: requestedOwnerUserId, ...campaignInput } = input;
    const actorId = await this.campaignsService.requireActorId(context);
    const ownerUserId = requestedOwnerUserId ?? actorId;

    if (ownerUserId !== actorId && !isSysAdminRole(context.systemRole)) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    const owner = await usersDependencies.useCases.getOneUserBy.execute({ userId: ownerUserId });

    if (!owner) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    await rulesetDependencies.service.getById(context, campaignInput.rulesetId);

    const slug = campaignInput.slug ?? this.campaignsService.slugify(campaignInput.name);

    if (!slug) {
      throw new ConflictError("Campaign slug cannot be derived from name");
    }

    try {
      const aggregate = await transactionManager.inTransaction(async (tx) => {
        const campaign = await repository.create(tx, {
          actorId,
          ownerUserId,
          campaign: { ...campaignInput, slug },
        });
        const membership = await repository.findMembership(tx, campaign.id, actorId);

        return this.campaignsService.buildAggregate(context, campaign, membership);
      });

      return toCampaignResponse(aggregate);
    } catch (error) {
      if (this.campaignsService.isUniqueViolation(error)) {
        throw new ConflictError("Campaign slug is already in use for this owner");
      }

      throw error;
    }
  }
}
