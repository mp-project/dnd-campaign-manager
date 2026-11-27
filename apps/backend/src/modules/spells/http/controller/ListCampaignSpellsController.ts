import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignParamsSchema,
  RequestCampaignSpellsQuerySchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListCampaignSpellsUseCase } from "#src/modules/spells/useCase/ListCampaignSpellsUseCase";

export class ListCampaignSpellsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignSpellsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestCampaignSpellsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
