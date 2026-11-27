import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignParamsSchema,
  RequestSpellCatalogQuerySchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListSpellCatalogUseCase } from "#src/modules/spells/useCase/ListSpellCatalogUseCase";

export class ListSpellCatalogController extends AbstractController {
  constructor(private readonly useCase: ListSpellCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestSpellCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
