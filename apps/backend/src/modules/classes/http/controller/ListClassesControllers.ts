import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignClassesParamsSchema,
  RequestCampaignClassesQuerySchema,
  RequestClassCatalogQuerySchema,
  RequestSystemClassesQuerySchema,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import type {
  ListCampaignClassesUseCase,
  ListClassCatalogUseCase,
  ListSystemClassesUseCase,
} from "#src/modules/classes/useCase/ListClassesUseCase";

type ListRequest = { params: unknown; query: unknown; requestContext: RequestContext };

export class ListCampaignClassesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignClassesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignClassesParamsSchema.parse(request.params);
      const query = RequestCampaignClassesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListClassCatalogController extends AbstractController {
  constructor(private readonly useCase: ListClassCatalogUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignClassesParamsSchema.parse(request.params);
      const query = RequestClassCatalogQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListSystemClassesController extends AbstractController {
  constructor(private readonly useCase: ListSystemClassesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const query = RequestSystemClassesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { query });
    });
}
