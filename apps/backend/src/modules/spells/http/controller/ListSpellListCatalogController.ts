import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignParamsSchema,
  RequestSpellListCatalogQuerySchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListSpellListCatalogUseCase } from "#src/modules/spells/useCase/ListSpellListCatalogUseCase";

export class ListSpellListCatalogController extends AbstractController {
  constructor(private readonly useCase: ListSpellListCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestSpellListCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
