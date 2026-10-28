import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateCampaignInvitationSchema } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import { CampaignInvitationParamsSchema } from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import { CreateCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/CreateCampaignInvitationUseCase";

export class CreateCampaignInvitationController extends AbstractController {
  constructor(private readonly createCampaignInvitationUseCase: CreateCampaignInvitationUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = CampaignInvitationParamsSchema.parse(request.params);
      const body = CreateCampaignInvitationSchema.parse(request.body);

      return this.createCampaignInvitationUseCase.execute(
        request.requestContext,
        params.campaignId,
        body,
      );
    });
}
