import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CampaignMembershipItemParamsSchema } from "#src/modules/campaign-memberships/domain/dto/RequestCampaignMembershipDto";
import { DeleteCampaignMemberUseCase } from "#src/modules/campaign-memberships/useCase/DeleteCampaignMemberUseCase";

export class DeleteCampaignMemberController extends AbstractController {
  constructor(private readonly deleteCampaignMemberUseCase: DeleteCampaignMemberUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = CampaignMembershipItemParamsSchema.parse(request.params);

      return this.deleteCampaignMemberUseCase.execute(
        request.requestContext,
        params.campaignId,
        params.memberId,
      );
    });
}
