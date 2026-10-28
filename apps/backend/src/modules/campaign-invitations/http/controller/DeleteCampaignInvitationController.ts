import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CampaignInvitationItemParamsSchema } from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import { DeleteCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/DeleteCampaignInvitationUseCase";

export class DeleteCampaignInvitationController extends AbstractController {
  constructor(private readonly deleteCampaignInvitationUseCase: DeleteCampaignInvitationUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = CampaignInvitationItemParamsSchema.parse(request.params);

      return this.deleteCampaignInvitationUseCase.execute(
        request.requestContext,
        params.campaignId,
        params.invitationId,
      );
    });
}
