import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignFeatsParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { GetFeatCategoriesUseCase } from "#src/modules/feats/useCase/GetFeatCategoriesUseCase";

export class GetFeatCategoriesController extends AbstractController {
  constructor(private readonly useCase: GetFeatCategoriesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatsParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
