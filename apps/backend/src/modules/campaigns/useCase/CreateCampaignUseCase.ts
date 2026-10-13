import type { RequestContext } from "#core/http/requestContext";
import { ConflictError, UnauthenticatedError } from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CreateCampaignDto } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import type { CampaignAggregate } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class CreateCampaignUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    input: CreateCampaignDto,
  ): Promise<CampaignAggregate> {
    const { createdBy, ownerUserId: requestedOwnerUserId, ...campaignInput } = input;
    const actorId = this.campaignsService.assertAuditableActorId(context);
    const ownerUserId = requestedOwnerUserId ?? createdBy;

    if (actorId !== createdBy) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    if (ownerUserId !== actorId && !isSysAdminRole(context.systemRole)) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    await this.assertUserExists(ownerUserId);

    try {
      return await this.campaignsService.transactionManager.inTransaction(async (tx) => {
        await this.assertRulesetExistsAndReadable(context, campaignInput.rulesetId);

        const slug = campaignInput.slug ?? this.campaignsService.slugify(campaignInput.name);

        if (!slug) {
          throw new ConflictError("Campaign slug cannot be derived from name");
        }

        const createdCampaign =
          await this.campaignsService.repository.insertCampaignWithOwnerMembership(tx, {
            actorId,
            ownerUserId,
            campaign: {
              ...campaignInput,
              slug,
            },
          });

        const membership = await this.campaignsService.repository.findMembership(
          tx,
          createdCampaign.id,
          actorId,
        );

        const aggregate: CampaignAggregate = {
          campaign: createdCampaign,
          membership,
          isOwner: false,
          effectivePermissions: [],
        };

        return this.campaignsService.attachEffectivePermissions(context, aggregate);
      });
    } catch (error) {
      if (this.campaignsService.isUniqueViolation(error)) {
        throw new ConflictError("Campaign slug is already in use for this owner");
      }

      throw error;
    }
  }

  private async assertRulesetExistsAndReadable(
    context: RequestContext,
    rulesetId: string,
  ): Promise<void> {
    const rulesetService = this.campaignsService.rulesetDependencies?.service;

    if (!rulesetService) {
      return;
    }

    await rulesetService.getById(context, rulesetId);
  }

  private async assertUserExists(userId: string): Promise<void> {
    const getOneUserByUseCase = this.campaignsService.usersDependencies?.useCases.getOneUserBy;

    if (!getOneUserByUseCase) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    const user = await getOneUserByUseCase.execute({ userId });

    if (!user) {
      throw new UnauthenticatedError("Authenticated user not found");
    }
  }
}
