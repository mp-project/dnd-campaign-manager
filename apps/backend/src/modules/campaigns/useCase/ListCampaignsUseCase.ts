import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { RequestCampaignDto } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import {
  type ResponseCampaignListDto,
  toCampaignListResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class ListCampaignsUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    filter: RequestCampaignDto["listQuery"],
  ): Promise<ResponseCampaignListDto> {
    const { db, repository } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);
    const targetUserId = await this.resolveTargetUserId(context, actorId, filter.userId);

    const listFilter: RequestCampaignDto["listQuery"] = {
      ...filter,
      userId: undefined,
    };

    const [items, total] = await Promise.all([
      repository.listForActor(db, targetUserId, listFilter),
      repository.countForActor(db, targetUserId, listFilter),
    ]);

    return toCampaignListResponse(
      items.map((item) => this.campaignsService.attachEffectivePermissions(context, item)),
      filter.limit,
      total,
    );
  }

  /**
   * Only system admins may list another user's campaigns; everyone else gets a 404.
   */
  private async resolveTargetUserId(
    context: RequestContext,
    actorId: string,
    requestedUserId?: string,
  ): Promise<string> {
    if (!requestedUserId) {
      return actorId;
    }

    const requestedUser =
      await this.campaignsService.usersDependencies.useCases.getOneUserBy.execute({
        userId: requestedUserId,
      });

    if (!requestedUser) {
      throw new NotFoundError("Campaign not found");
    }

    if (requestedUserId !== actorId && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Campaign not found");
    }

    return requestedUserId;
  }
}
