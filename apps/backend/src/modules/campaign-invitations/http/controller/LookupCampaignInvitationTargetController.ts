import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  CampaignInvitationLookupQuerySchema,
  CampaignInvitationParamsSchema,
} from "#src/modules/campaign-invitations/domain/dto/RequestCampaignInvitationDto";
import { LookupCampaignInvitationTargetUseCase } from "#src/modules/campaign-invitations/useCase/LookupCampaignInvitationTargetUseCase";

export class LookupCampaignInvitationTargetController extends AbstractController {
  constructor(
    private readonly lookupCampaignInvitationTargetUseCase: LookupCampaignInvitationTargetUseCase,
  ) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = CampaignInvitationParamsSchema.parse(request.params);
      const query = CampaignInvitationLookupQuerySchema.parse(request.query);

      return this.lookupCampaignInvitationTargetUseCase.execute(
        request.requestContext,
        params.campaignId,
        query.userTag,
      );
    });
}
