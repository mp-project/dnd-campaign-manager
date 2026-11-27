import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSubclassesParamsSchema,
  RequestCampaignSubclassesQuerySchema,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { ListCampaignSubclassesUseCase } from "#src/modules/subclasses/useCase/ListCampaignSubclassesUseCase";

export class ListCampaignSubclassesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignSubclassesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignSubclassesParamsSchema.parse(request.params);
      const query = RequestCampaignSubclassesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
