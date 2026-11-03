import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { AcceptCampaignInvitationSchema } from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import { AcceptCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/AcceptCampaignInvitationUseCase";

export class AcceptCampaignInvitationController extends AbstractController {
  constructor(private readonly acceptCampaignInvitationUseCase: AcceptCampaignInvitationUseCase) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = AcceptCampaignInvitationSchema.parse(request.body);

      return this.acceptCampaignInvitationUseCase.execute(request.requestContext, body.token);
    });
}
