import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeaturesParamsSchema,
  RequestCampaignFeaturesQuerySchema,
  RequestFeatureCatalogQuerySchema,
  RequestSystemFeaturesQuerySchema,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import type {
  ListCampaignFeaturesUseCase,
  ListFeatureCatalogUseCase,
  ListSystemFeaturesUseCase,
} from "#src/modules/features/useCase/ListFeaturesUseCase";

type ListRequest = { params: unknown; query: unknown; requestContext: RequestContext };

export class ListCampaignFeaturesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignFeaturesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignFeaturesParamsSchema.parse(request.params);
      const query = RequestCampaignFeaturesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListFeatureCatalogController extends AbstractController {
  constructor(private readonly useCase: ListFeatureCatalogUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignFeaturesParamsSchema.parse(request.params);
      const query = RequestFeatureCatalogQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListSystemFeaturesController extends AbstractController {
  constructor(private readonly useCase: ListSystemFeaturesUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const query = RequestSystemFeaturesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { query });
    });
}
