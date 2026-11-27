import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignClassesParamsSchema,
  RequestCampaignClassesQuerySchema,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ListCampaignClassesUseCase } from "#src/modules/classes/useCase/ListCampaignClassesUseCase";

export class ListCampaignClassesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignClassesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignClassesParamsSchema.parse(request.params);
      const query = RequestCampaignClassesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
