import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignClassesParamsSchema,
  RequestClassCatalogQuerySchema,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ListClassCatalogUseCase } from "#src/modules/classes/useCase/ListClassCatalogUseCase";

export class ListClassCatalogController extends AbstractController {
  constructor(private readonly useCase: ListClassCatalogUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignClassesParamsSchema.parse(request.params);
      const query = RequestClassCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
