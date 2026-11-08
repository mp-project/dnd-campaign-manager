import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSpeciesListParamsSchema,
  RequestCampaignSpeciesQuerySchema,
  RequestSpeciesCatalogQuerySchema,
  RequestSystemSpeciesQuerySchema,
} from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type {
  ListCampaignSpeciesUseCase,
  ListSpeciesCatalogUseCase,
  ListSystemSpeciesUseCase,
} from "#src/modules/species/useCase/ListSpeciesUseCase";

type ListRequest = { params: unknown; query: unknown; requestContext: RequestContext };

export class ListCampaignSpeciesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignSpeciesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignSpeciesListParamsSchema.parse(request.params);
      const query = RequestCampaignSpeciesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListSpeciesCatalogController extends AbstractController {
  constructor(private readonly useCase: ListSpeciesCatalogUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignSpeciesListParamsSchema.parse(request.params);
      const query = RequestSpeciesCatalogQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListSystemSpeciesController extends AbstractController {
  constructor(private readonly useCase: ListSystemSpeciesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const query = RequestSystemSpeciesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { query });
    });
}
