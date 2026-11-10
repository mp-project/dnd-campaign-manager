import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestBackgroundCatalogQuerySchema,
  RequestCampaignBackgroundsParamsSchema,
  RequestCampaignBackgroundsQuerySchema,
  RequestSystemBackgroundsQuerySchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type {
  ListBackgroundCatalogUseCase,
  ListCampaignBackgroundsUseCase,
  ListSystemBackgroundsUseCase,
} from "#src/modules/backgrounds/useCase/ListBackgroundsUseCase";

type ListRequest = { params: unknown; query: unknown; requestContext: RequestContext };

export class ListCampaignBackgroundsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignBackgroundsUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignBackgroundsParamsSchema.parse(request.params);
      const query = RequestCampaignBackgroundsQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListBackgroundCatalogController extends AbstractController {
  constructor(private readonly useCase: ListBackgroundCatalogUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignBackgroundsParamsSchema.parse(request.params);
      const query = RequestBackgroundCatalogQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListSystemBackgroundsController extends AbstractController {
  constructor(private readonly useCase: ListSystemBackgroundsUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const query = RequestSystemBackgroundsQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { query });
    });
}
