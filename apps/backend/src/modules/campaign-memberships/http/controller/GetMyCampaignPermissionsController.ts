import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CampaignMembershipParamsSchema } from "#src/modules/campaign-memberships/domain/dto/RequestCampaignMembershipDto";
import { GetMyCampaignPermissionsUseCase } from "#src/modules/campaign-memberships/useCase/GetMyCampaignPermissionsUseCase";

export class GetMyCampaignPermissionsController extends AbstractController {
  constructor(private readonly getMyCampaignPermissionsUseCase: GetMyCampaignPermissionsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = CampaignMembershipParamsSchema.parse(request.params);

      return this.getMyCampaignPermissionsUseCase.execute(
        request.requestContext,
        params.campaignId,
      );
    });
}
