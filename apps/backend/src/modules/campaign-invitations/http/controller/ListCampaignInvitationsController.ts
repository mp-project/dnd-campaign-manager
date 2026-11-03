import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CampaignInvitationParamsSchema } from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import { ListCampaignInvitationsUseCase } from "#src/modules/campaign-invitations/useCase/ListCampaignInvitationsUseCase";

export class ListCampaignInvitationsController extends AbstractController {
  constructor(private readonly listCampaignInvitationsUseCase: ListCampaignInvitationsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = CampaignInvitationParamsSchema.parse(request.params);

      return this.listCampaignInvitationsUseCase.execute(
        request.requestContext,
        params.campaignId,
      );
    });
}
