import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSubclassesParamsSchema,
  RequestCampaignSubclassesQuerySchema,
  RequestCatalogClassSubclassesParamsSchema,
  RequestSystemSubclassesQuerySchema,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type {
  ListCampaignSubclassesUseCase,
  ListClassSubclassesUseCase,
  ListSystemSubclassesUseCase,
} from "#src/modules/subclasses/useCase/ListSubclassesUseCase";

type ListRequest = { params: unknown; query: unknown; requestContext: RequestContext };

export class ListCampaignSubclassesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignSubclassesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignSubclassesParamsSchema.parse(request.params);
      const query = RequestCampaignSubclassesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListClassSubclassesController extends AbstractController {
  constructor(private readonly useCase: ListClassSubclassesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCatalogClassSubclassesParamsSchema.parse(request.params),
      ),
    );
}

export class ListSystemSubclassesController extends AbstractController {
  constructor(private readonly useCase: ListSystemSubclassesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const query = RequestSystemSubclassesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { query });
    });
}
