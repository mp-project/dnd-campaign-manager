import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignBackgroundsParamsSchema,
  RequestCampaignBackgroundsQuerySchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ListCampaignBackgroundsUseCase } from "#src/modules/backgrounds/useCase/ListCampaignBackgroundsUseCase";

export class ListCampaignBackgroundsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignBackgroundsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignBackgroundsParamsSchema.parse(request.params);
      const query = RequestCampaignBackgroundsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
