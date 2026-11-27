import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeatsParamsSchema,
  RequestCampaignFeatsQuerySchema,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ListCampaignFeatsUseCase } from "#src/modules/feats/useCase/ListCampaignFeatsUseCase";

export class ListCampaignFeatsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignFeatsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatsParamsSchema.parse(request.params);
      const query = RequestCampaignFeatsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
