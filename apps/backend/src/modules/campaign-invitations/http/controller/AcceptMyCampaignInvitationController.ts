import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { MyCampaignInvitationParamsSchema } from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import type { AcceptMyCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/AcceptMyCampaignInvitationUseCase";

export class AcceptMyCampaignInvitationController extends AbstractController {
  constructor(private readonly acceptMyCampaignInvitationUseCase: AcceptMyCampaignInvitationUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { invitationId } = MyCampaignInvitationParamsSchema.parse(request.params);

      return this.acceptMyCampaignInvitationUseCase.execute(request.requestContext, invitationId);
    });
}
