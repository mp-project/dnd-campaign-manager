import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { MyCampaignInvitationParamsSchema } from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import type { DeclineMyCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/DeclineMyCampaignInvitationUseCase";

export class DeclineMyCampaignInvitationController extends AbstractController {
  constructor(private readonly declineMyCampaignInvitationUseCase: DeclineMyCampaignInvitationUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { invitationId } = MyCampaignInvitationParamsSchema.parse(request.params);

      await this.declineMyCampaignInvitationUseCase.execute(request.requestContext, invitationId);
    });
}
