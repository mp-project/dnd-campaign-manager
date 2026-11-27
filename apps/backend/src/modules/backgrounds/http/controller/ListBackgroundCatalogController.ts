import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestBackgroundCatalogQuerySchema,
  RequestCampaignBackgroundsParamsSchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ListBackgroundCatalogUseCase } from "#src/modules/backgrounds/useCase/ListBackgroundCatalogUseCase";

export class ListBackgroundCatalogController extends AbstractController {
  constructor(private readonly useCase: ListBackgroundCatalogUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignBackgroundsParamsSchema.parse(request.params);
      const query = RequestBackgroundCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
