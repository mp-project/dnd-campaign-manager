import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignParamsSchema,
  RequestCampaignSpellListsQuerySchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListCampaignSpellListsUseCase } from "#src/modules/spells/useCase/ListCampaignSpellListsUseCase";

export class ListCampaignSpellListsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignSpellListsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestCampaignSpellListsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
