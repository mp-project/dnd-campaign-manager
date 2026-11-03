import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CampaignMembershipParamsSchema } from "#src/modules/campaign-memberships/domain/dto/RequestCampaignMembershipDto";
import { ListCampaignMembersUseCase } from "#src/modules/campaign-memberships/useCase/ListCampaignMembersUseCase";

export class ListCampaignMembersController extends AbstractController {
  constructor(private readonly listCampaignMembersUseCase: ListCampaignMembersUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = CampaignMembershipParamsSchema.parse(request.params);

      return this.listCampaignMembersUseCase.execute(request.requestContext, params.campaignId);
    });
}
