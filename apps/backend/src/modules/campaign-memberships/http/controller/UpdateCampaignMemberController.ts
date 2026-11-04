import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CampaignMembershipItemParamsSchema } from "#src/modules/campaign-memberships/domain/dto/RequestCampaignMembershipDto";
import { UpdateCampaignMembershipRoleSchema } from "#src/modules/campaign-memberships/domain/dto/UpdateCampaignMembershipDto";
import { UpdateCampaignMemberUseCase } from "#src/modules/campaign-memberships/useCase/UpdateCampaignMemberUseCase";

export class UpdateCampaignMemberController extends AbstractController {
  constructor(private readonly updateCampaignMemberUseCase: UpdateCampaignMemberUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = CampaignMembershipItemParamsSchema.parse(request.params);
      const body = UpdateCampaignMembershipRoleSchema.parse(request.body);

      return this.updateCampaignMemberUseCase.execute(request.requestContext, {
        campaignId: params.campaignId,
        memberId: params.memberId,
        command: body,
      });
    });
}
