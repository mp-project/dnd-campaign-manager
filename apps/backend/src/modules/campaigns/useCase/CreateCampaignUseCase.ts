import { ConflictError, UnauthenticatedError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CreateCampaignDto } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CAMPAIGN_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaign";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class CreateCampaignUseCase extends MutationUseCase<CreateCampaignDto, ResponseCampaignDto> {
  protected readonly action = CAMPAIGN_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly campaignsService: CampaignsService,
  ) {
    super(history);
  }

  protected override async prepare(
    context: RequestContext,
    input: CreateCampaignDto,
  ): Promise<void> {
    const { usersDependencies, rulesetDependencies } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);
    const ownerUserId = input.ownerUserId ?? actorId;

    if (ownerUserId !== actorId && !isSysAdminRole(context.systemRole)) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    const owner = await usersDependencies.useCases.getOneUserBy.execute({ userId: ownerUserId });

    if (!owner) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    await rulesetDependencies.service.getById(context, input.rulesetId);
  }

  /** Everything is checked in `prepare`, because it needs the users and ruleset modules. */
  protected async authorize(): Promise<Authorization> {
    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateCampaignDto,
  ): Promise<ResponseCampaignDto> {
    const { trackedCampaign, trackedMembership } = this.campaignsService;
    const { ownerUserId: requestedOwnerUserId, ...campaignInput } = input;
    const actorId = context.actorId as string;
    const ownerUserId = requestedOwnerUserId ?? actorId;
    const slug = campaignInput.slug ?? this.campaignsService.slugify(campaignInput.name);

    if (!slug) {
      throw new ConflictError("Campaign slug cannot be derived from name");
    }

    const campaign = await this.campaignsService.withSlugConflict(() =>
      scope.create(trackedCampaign, {
        ownerUserId,
        rulesetId: campaignInput.rulesetId,
        name: campaignInput.name,
        slug,
        description: campaignInput.description,
        status: "DRAFT",
        currentGameDay: 0,
        longRestCount: 0,
        settings: campaignInput.settings,
      }),
    );

    await scope.create(trackedMembership, {
      campaignId: campaign.id,
      userId: ownerUserId,
      role: "EDITOR",
    });

    return toCampaignResponse(
      await this.campaignsService.toAggregate(scope.tx, context, campaign),
    );
  }
}
