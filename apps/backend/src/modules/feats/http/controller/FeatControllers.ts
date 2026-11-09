import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateFeatSchema } from "#src/modules/feats/domain/dto/CreateFeatDto";
import {
  EligibilityCheckSchema,
  RequestCampaignFeatParamsSchema,
  RequestCampaignFeatsParamsSchema,
  RequestCampaignFeatsQuerySchema,
  RequestFeatCatalogQuerySchema,
  RequestFeatParamsSchema,
  RequestFeatScopeParamsSchema,
  RequestSystemFeatsQuerySchema,
  ResolveFeatSchema,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import {
  FeatLifecycleCommandSchema,
  UpdateFeatSchema,
} from "#src/modules/feats/domain/dto/UpdateFeatDto";
import type {
  CheckFeatEligibilityUseCase,
  GetFeatCategoriesUseCase,
  GetFeatChoicesUseCase,
  GetFeatFeaturesUseCase,
  GetFeatPrerequisitesUseCase,
  GetFeatUsagesUseCase,
  GetFeatUseCase,
  ResolveFeatUseCase,
} from "#src/modules/feats/useCase/FeatReadUseCases";
import type {
  CreateFeatUseCase,
  DeleteFeatUseCase,
  RestoreFeatUseCase,
  UpdateFeatUseCase,
  ValidateFeatUseCase,
} from "#src/modules/feats/useCase/FeatWriteUseCases";
import type {
  ListCampaignFeatsUseCase,
  ListFeatCatalogUseCase,
  ListSystemFeatsUseCase,
} from "#src/modules/feats/useCase/ListFeatsUseCase";

type ListRequest = { params: unknown; query: unknown; requestContext: RequestContext };
type ParamsRequest = { params: unknown; requestContext: RequestContext };
type BodyRequest = { params: unknown; body: unknown; requestContext: RequestContext };
type QueryRequest = { params: unknown; query: unknown; requestContext: RequestContext };

export class ListCampaignFeatsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignFeatsUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignFeatsParamsSchema.parse(request.params);
      const query = RequestCampaignFeatsQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListFeatCatalogController extends AbstractController {
  constructor(private readonly useCase: ListFeatCatalogUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const params = RequestCampaignFeatsParamsSchema.parse(request.params);
      const query = RequestFeatCatalogQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}

export class ListSystemFeatsController extends AbstractController {
  constructor(private readonly useCase: ListSystemFeatsUseCase) {
    super();
  }

  handle = async (request: ListRequest) =>
    this.execute(async () => {
      const query = RequestSystemFeatsQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { query });
    });
}

export class GetFeatController extends AbstractController {
  constructor(private readonly useCase: GetFeatUseCase) {
    super();
  }

  handle = async (request: ParamsRequest) =>
    this.execute(async () =>
      this.useCase.execute(request.requestContext, RequestFeatParamsSchema.parse(request.params)),
    );
}

/** The read-only sections of the catalog detail. */
export class GetFeatSectionController extends AbstractController {
  constructor(
    private readonly useCase:
      | GetFeatPrerequisitesUseCase
      | GetFeatChoicesUseCase
      | GetFeatFeaturesUseCase
      | GetFeatUsagesUseCase,
  ) {
    super();
  }

  handle = async (request: ParamsRequest) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCampaignFeatParamsSchema.parse(request.params),
      ),
    );
}

export class GetFeatCategoriesController extends AbstractController {
  constructor(private readonly useCase: GetFeatCategoriesUseCase) {
    super();
  }

  handle = async (request: ParamsRequest) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCampaignFeatsParamsSchema.parse(request.params),
      ),
    );
}

export class CheckFeatEligibilityController extends AbstractController {
  constructor(private readonly useCase: CheckFeatEligibilityUseCase) {
    super();
  }

  handle = async (request: BodyRequest) =>
    this.execute(async () => {
      const params = RequestCampaignFeatParamsSchema.parse(request.params);
      const command = EligibilityCheckSchema.parse(request.body ?? {});

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}

export class ResolveFeatController extends AbstractController {
  constructor(private readonly useCase: ResolveFeatUseCase) {
    super();
  }

  handle = async (request: BodyRequest) =>
    this.execute(async () => {
      const params = RequestCampaignFeatParamsSchema.parse(request.params);
      const command = ResolveFeatSchema.parse(request.body ?? {});

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}

export class CreateFeatController extends AbstractController {
  constructor(private readonly useCase: CreateFeatUseCase) {
    super();
  }

  handle = async (request: BodyRequest) =>
    this.execute(async () => {
      const { campaignId } = RequestFeatScopeParamsSchema.parse(request.params ?? {});
      const command = CreateFeatSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, command });
    });
}

export class UpdateFeatController extends AbstractController {
  constructor(private readonly useCase: UpdateFeatUseCase) {
    super();
  }

  handle = async (request: BodyRequest) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);
      const command = UpdateFeatSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featId,
        command,
      });
    });
}

export class DeleteFeatController extends AbstractController {
  constructor(private readonly useCase: DeleteFeatUseCase) {
    super();
  }

  handle = async (request: QueryRequest) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);
      const command = FeatLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featId,
        command,
      });
    });
}

export class RestoreFeatController extends AbstractController {
  constructor(private readonly useCase: RestoreFeatUseCase) {
    super();
  }

  handle = async (request: BodyRequest) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);
      const command = FeatLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featId,
        command,
      });
    });
}

export class ValidateFeatController extends AbstractController {
  constructor(private readonly useCase: ValidateFeatUseCase) {
    super();
  }

  handle = async (request: ParamsRequest) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, featId });
    });
}
