import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";

import { GetMyCampaignOverviewUseCase } from "#src/modules/users/useCase/GetMyCampaignOverviewUseCase";

export class GetMyCampaignOverviewController extends AbstractController {
  constructor(
    private readonly getMyCampaignOverviewUseCase: GetMyCampaignOverviewUseCase,
  ) {
    super();
  }

  handle = async (request: { requestContext: RequestContext }) =>
    this.execute(async () => {
      return this.getMyCampaignOverviewUseCase.execute(request.requestContext);
    });
}
