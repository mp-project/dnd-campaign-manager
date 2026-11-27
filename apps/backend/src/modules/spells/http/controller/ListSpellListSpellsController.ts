import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSpellListParamsSchema,
  RequestSpellCatalogQuerySchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListSpellListSpellsUseCase } from "#src/modules/spells/useCase/ListSpellListSpellsUseCase";

/** The catalog filters apply, except `list`, which is the list of the path. */
export class ListSpellListSpellsController extends AbstractController {
  constructor(private readonly useCase: ListSpellListSpellsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignSpellListParamsSchema.parse(request.params);
      const query = RequestSpellCatalogQuerySchema.omit({ list: true }).parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
