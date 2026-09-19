import type { RequestContext } from "#core/http/requestContext";

import { GetMyCampaignOverviewUseCase } from "#src/modules/users/useCase/GetMyCampaignOverviewUseCase";

export class GetMyCampaignOverviewController {
  constructor(
    private readonly getMyCampaignOverviewUseCase: GetMyCampaignOverviewUseCase,
  ) {}

  handle = async (request: { requestContext: RequestContext }) => {
    return this.getMyCampaignOverviewUseCase.execute(request.requestContext);
  };
}
