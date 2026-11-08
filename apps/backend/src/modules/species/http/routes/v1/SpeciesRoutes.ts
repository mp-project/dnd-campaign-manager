import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import {
  CreateSpeciesSchema,
  CreateSpeciesVariantSchema,
} from "#src/modules/species/domain/dto/CreateSpeciesDto";
import {
  RequestCampaignSpeciesListParamsSchema,
  RequestCampaignSpeciesParamsSchema,
  RequestCampaignSpeciesQuerySchema,
  RequestSpeciesCatalogQuerySchema,
  RequestSpeciesVariantParamsSchema,
  RequestSystemSpeciesParamsSchema,
  RequestSystemSpeciesQuerySchema,
  SpeciesSelectionSchema,
} from "#src/modules/species/domain/dto/RequestSpeciesDto";
import {
  ResponseSpeciesCreationOptionsSchema,
  ResponseSpeciesFeaturesSchema,
  ResponseSpeciesGmSchema,
  ResponseSpeciesListSchema,
  ResponseSpeciesSchema,
  ResponseSpeciesSelectionSchema,
  ResponseUpdateSpeciesSchema,
  ResponseValidationSchema,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import {
  ResponseSpeciesVariantGmSchema,
  ResponseSpeciesVariantListSchema,
  ResponseSpeciesVariantSchema,
  ResponseUpdateSpeciesVariantSchema,
} from "#src/modules/species/domain/dto/ResponseSpeciesVariantDto";
import {
  SpeciesLifecycleCommandSchema,
  UpdateSpeciesSchema,
  UpdateSpeciesVariantSchema,
} from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type { CreateSpeciesController } from "#src/modules/species/http/controller/CreateSpeciesController";
import type { CreateSpeciesVariantController } from "#src/modules/species/http/controller/CreateSpeciesVariantController";
import type { DeleteSpeciesController } from "#src/modules/species/http/controller/DeleteSpeciesController";
import type { DeleteSpeciesVariantController } from "#src/modules/species/http/controller/DeleteSpeciesVariantController";
import type { GetSpeciesController } from "#src/modules/species/http/controller/GetSpeciesController";
import type { GetSpeciesCreationOptionsController } from "#src/modules/species/http/controller/GetSpeciesCreationOptionsController";
import type { GetSpeciesFeaturesController } from "#src/modules/species/http/controller/GetSpeciesFeaturesController";
import type { GetSpeciesUsagesController } from "#src/modules/species/http/controller/GetSpeciesUsagesController";
import type { GetSpeciesVariantController } from "#src/modules/species/http/controller/GetSpeciesVariantController";
import type {
  ListCampaignSpeciesController,
  ListSpeciesCatalogController,
  ListSystemSpeciesController,
} from "#src/modules/species/http/controller/ListSpeciesControllers";
import type { ListSpeciesVariantsController } from "#src/modules/species/http/controller/ListSpeciesVariantsController";
import type { ResolveSpeciesSelectionController } from "#src/modules/species/http/controller/ResolveSpeciesSelectionController";
import type { RestoreSpeciesController } from "#src/modules/species/http/controller/RestoreSpeciesController";
import type { RestoreSpeciesVariantController } from "#src/modules/species/http/controller/RestoreSpeciesVariantController";
import type { UpdateSpeciesController } from "#src/modules/species/http/controller/UpdateSpeciesController";
import type { UpdateSpeciesVariantController } from "#src/modules/species/http/controller/UpdateSpeciesVariantController";
import type { ValidateSpeciesController } from "#src/modules/species/http/controller/ValidateSpeciesController";
import type { ValidateSpeciesVariantController } from "#src/modules/species/http/controller/ValidateSpeciesVariantController";
import { SPECIES_PERMISSIONS } from "#src/modules/species/permissions/SpeciesPermissions";

/** Controllers that exist once per read mode: custom (`campaign`), `catalog` and global (`system`). */
type PerMode<T> = { campaign: T; catalog: T; system: T };

export type SpeciesRouteControllers = {
  listCampaignSpeciesController: ListCampaignSpeciesController;
  listSpeciesCatalogController: ListSpeciesCatalogController;
  listSystemSpeciesController: ListSystemSpeciesController;
  getSpeciesControllers: PerMode<GetSpeciesController>;
  listVariantsControllers: PerMode<ListSpeciesVariantsController>;
  getVariantControllers: PerMode<GetSpeciesVariantController>;
  createSpeciesController: CreateSpeciesController;
  updateSpeciesController: UpdateSpeciesController;
  deleteSpeciesController: DeleteSpeciesController;
  restoreSpeciesController: RestoreSpeciesController;
  validateSpeciesController: ValidateSpeciesController;
  createVariantController: CreateSpeciesVariantController;
  updateVariantController: UpdateSpeciesVariantController;
  deleteVariantController: DeleteSpeciesVariantController;
  restoreVariantController: RestoreSpeciesVariantController;
  validateVariantController: ValidateSpeciesVariantController;
  getFeaturesController: GetSpeciesFeaturesController;
  getCreationOptionsController: GetSpeciesCreationOptionsController;
  resolveSelectionController: ResolveSpeciesSelectionController;
  getCampaignUsagesController: GetSpeciesUsagesController;
  getCatalogUsagesController: GetSpeciesUsagesController;
};

const security = [{ cookieAuth: [] }] as const;
const tags = ["Species"];

const readErrorResponses = {
  400: errorResponseDto,
  401: errorResponseDto,
  403: errorResponseDto,
  404: errorResponseDto,
} as const;

const writeErrorResponses = {
  ...readErrorResponses,
  409: errorResponseDto,
  412: errorResponseDto,
} as const;

const campaignRead = { key: SPECIES_PERMISSIONS.read, hideAsNotFoundForPlayers: true };
const campaignUsages = { key: SPECIES_PERMISSIONS.readUsages, hideAsNotFoundForPlayers: true };

type Handler = (request: never) => Promise<unknown>;

type RouteSpec = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  operationId: string;
  permission: { key: string; hideAsNotFoundForPlayers?: boolean };
  params?: ZodType | undefined;
  querystring?: ZodType;
  body?: ZodType;
  /** Status code and schema of the success response. */
  success: [200 | 201, ZodType];
  write?: boolean;
  handler: Handler;
};

function route(app: FastifyInstance, spec: RouteSpec): void {
  const [status, response] = spec.success;
  const handler =
    status === 201
      ? async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
          reply.code(201).send(await spec.handler(request as never))
      : spec.handler;

  app.route({
    method: spec.method,
    url: spec.url,
    config: { permission: spec.permission },
    schema: {
      tags,
      operationId: spec.operationId,
      security,
      ...(spec.params ? { params: spec.params } : {}),
      ...(spec.querystring ? { querystring: spec.querystring } : {}),
      ...(spec.body ? { body: spec.body } : {}),
      response: {
        [status]: response,
        ...(spec.write ? writeErrorResponses : readErrorResponses),
      },
    },
    handler: handler as never,
  });
}

/**
 * Custom species under `/campaigns/:campaignId/species`, the catalog of everything a campaign may
 * choose under `/campaigns/:campaignId/catalog/species` (with variants, features, creation options,
 * usages and the resolution of a selection), global species under `/species`. Variants are nested
 * under their species in each of them. Global species use the same permissions; the use case only
 * lets administrators change them.
 */
export function registerSpeciesRoutes(app: FastifyInstance, controllers: SpeciesRouteControllers): void {
  const scopes = [
    {
      mode: "campaign" as const,
      base: "/campaigns/:campaignId/species",
      prefix: "Campaign",
      read: campaignRead,
      listParams: RequestCampaignSpeciesListParamsSchema,
      params: RequestCampaignSpeciesParamsSchema,
      variantParams: RequestSpeciesVariantParamsSchema.required({ campaignId: true }),
    },
    {
      mode: "system" as const,
      base: "/species",
      prefix: "System",
      read: { key: SPECIES_PERMISSIONS.read },
      listParams: undefined,
      params: RequestSystemSpeciesParamsSchema,
      variantParams: RequestSpeciesVariantParamsSchema.omit({ campaignId: true }),
    },
  ];

  // ---------------------------------------------------------------------------
  // Custom species of a campaign and global species: CRUD for species and variants
  // ---------------------------------------------------------------------------

  for (const scope of scopes) {
    const item = `${scope.base}/:speciesId`;
    const variant = `${item}/variants/:variantId`;
    const write = (key: string) => ({ key });

    if (scope.mode === "campaign") {
      route(app, {
        method: "GET",
        url: scope.base,
        operationId: "listCampaignSpecies",
        permission: scope.read,
        params: scope.listParams,
        querystring: RequestCampaignSpeciesQuerySchema,
        success: [200, ResponseSpeciesListSchema],
        handler: controllers.listCampaignSpeciesController.handle,
      });
    } else {
      route(app, {
        method: "GET",
        url: scope.base,
        operationId: "listSystemSpecies",
        permission: scope.read,
        querystring: RequestSystemSpeciesQuerySchema,
        success: [200, ResponseSpeciesListSchema],
        handler: controllers.listSystemSpeciesController.handle,
      });
    }

    route(app, {
      method: "POST",
      url: scope.base,
      operationId: `create${scope.prefix}Species`,
      permission: write(SPECIES_PERMISSIONS.create),
      params: scope.listParams,
      body: CreateSpeciesSchema,
      success: [201, ResponseSpeciesGmSchema],
      write: true,
      handler: controllers.createSpeciesController.handle,
    });
    route(app, {
      method: "GET",
      url: item,
      operationId: `get${scope.prefix}Species`,
      permission: scope.read,
      params: scope.params,
      success: [200, ResponseSpeciesSchema],
      handler: controllers.getSpeciesControllers[scope.mode].handle,
    });
    route(app, {
      method: "PATCH",
      url: item,
      operationId: `update${scope.prefix}Species`,
      permission: write(SPECIES_PERMISSIONS.update),
      params: scope.params,
      body: UpdateSpeciesSchema,
      success: [200, ResponseUpdateSpeciesSchema],
      write: true,
      handler: controllers.updateSpeciesController.handle,
    });
    route(app, {
      method: "DELETE",
      url: item,
      operationId: `delete${scope.prefix}Species`,
      permission: write(SPECIES_PERMISSIONS.delete),
      params: scope.params,
      querystring: SpeciesLifecycleCommandSchema,
      success: [200, ResponseSpeciesGmSchema],
      write: true,
      handler: controllers.deleteSpeciesController.handle,
    });
    route(app, {
      method: "POST",
      url: `${item}/restore`,
      operationId: `restore${scope.prefix}Species`,
      permission: write(SPECIES_PERMISSIONS.restore),
      params: scope.params,
      body: SpeciesLifecycleCommandSchema,
      success: [200, ResponseSpeciesGmSchema],
      write: true,
      handler: controllers.restoreSpeciesController.handle,
    });
    route(app, {
      method: "POST",
      url: `${item}/validate`,
      operationId: `validate${scope.prefix}Species`,
      permission: write(SPECIES_PERMISSIONS.validate),
      params: scope.params,
      success: [200, ResponseValidationSchema],
      handler: controllers.validateSpeciesController.handle,
    });

    if (scope.mode === "campaign") {
      route(app, {
        method: "GET",
        url: `${item}/usages`,
        operationId: "getCampaignSpeciesUsages",
        permission: campaignUsages,
        params: scope.params,
        success: [200, ResponseAssetUsagesSchema],
        handler: controllers.getCampaignUsagesController.handle,
      });
    }

    route(app, {
      method: "GET",
      url: `${item}/variants`,
      operationId: `list${scope.prefix}SpeciesVariants`,
      permission: scope.read,
      params: scope.params,
      success: [200, ResponseSpeciesVariantListSchema],
      handler: controllers.listVariantsControllers[scope.mode].handle,
    });
    route(app, {
      method: "POST",
      url: `${item}/variants`,
      operationId: `create${scope.prefix}SpeciesVariant`,
      permission: write(SPECIES_PERMISSIONS.create),
      params: scope.params,
      body: CreateSpeciesVariantSchema,
      success: [201, ResponseSpeciesVariantGmSchema],
      write: true,
      handler: controllers.createVariantController.handle,
    });
    route(app, {
      method: "GET",
      url: variant,
      operationId: `get${scope.prefix}SpeciesVariant`,
      permission: scope.read,
      params: scope.variantParams,
      success: [200, ResponseSpeciesVariantSchema],
      handler: controllers.getVariantControllers[scope.mode].handle,
    });
    route(app, {
      method: "PATCH",
      url: variant,
      operationId: `update${scope.prefix}SpeciesVariant`,
      permission: write(SPECIES_PERMISSIONS.update),
      params: scope.variantParams,
      body: UpdateSpeciesVariantSchema,
      success: [200, ResponseUpdateSpeciesVariantSchema],
      write: true,
      handler: controllers.updateVariantController.handle,
    });
    route(app, {
      method: "DELETE",
      url: variant,
      operationId: `delete${scope.prefix}SpeciesVariant`,
      permission: write(SPECIES_PERMISSIONS.delete),
      params: scope.variantParams,
      querystring: SpeciesLifecycleCommandSchema,
      success: [200, ResponseSpeciesVariantGmSchema],
      write: true,
      handler: controllers.deleteVariantController.handle,
    });
    route(app, {
      method: "POST",
      url: `${variant}/restore`,
      operationId: `restore${scope.prefix}SpeciesVariant`,
      permission: write(SPECIES_PERMISSIONS.restore),
      params: scope.variantParams,
      body: SpeciesLifecycleCommandSchema,
      success: [200, ResponseSpeciesVariantGmSchema],
      write: true,
      handler: controllers.restoreVariantController.handle,
    });
    route(app, {
      method: "POST",
      url: `${variant}/validate`,
      operationId: `validate${scope.prefix}SpeciesVariant`,
      permission: write(SPECIES_PERMISSIONS.validate),
      params: scope.variantParams,
      success: [200, ResponseValidationSchema],
      handler: controllers.validateVariantController.handle,
    });
  }

  // ---------------------------------------------------------------------------
  // Catalog of a campaign
  // ---------------------------------------------------------------------------

  const catalog = "/campaigns/:campaignId/catalog/species";
  const catalogItem = `${catalog}/:speciesId`;

  route(app, {
    method: "GET",
    url: catalog,
    operationId: "listSpeciesCatalog",
    permission: campaignRead,
    params: RequestCampaignSpeciesListParamsSchema,
    querystring: RequestSpeciesCatalogQuerySchema,
    success: [200, ResponseSpeciesListSchema],
    handler: controllers.listSpeciesCatalogController.handle,
  });
  route(app, {
    method: "GET",
    url: catalogItem,
    operationId: "getCatalogSpecies",
    permission: campaignRead,
    params: RequestCampaignSpeciesParamsSchema,
    success: [200, ResponseSpeciesSchema],
    handler: controllers.getSpeciesControllers.catalog.handle,
  });
  route(app, {
    method: "GET",
    url: `${catalogItem}/variants`,
    operationId: "listCatalogSpeciesVariants",
    permission: campaignRead,
    params: RequestCampaignSpeciesParamsSchema,
    success: [200, ResponseSpeciesVariantListSchema],
    handler: controllers.listVariantsControllers.catalog.handle,
  });
  route(app, {
    method: "GET",
    url: `${catalogItem}/variants/:variantId`,
    operationId: "getCatalogSpeciesVariant",
    permission: campaignRead,
    params: RequestSpeciesVariantParamsSchema.required({ campaignId: true }),
    success: [200, ResponseSpeciesVariantSchema],
    handler: controllers.getVariantControllers.catalog.handle,
  });
  route(app, {
    method: "GET",
    url: `${catalogItem}/features`,
    operationId: "getCatalogSpeciesFeatures",
    permission: campaignRead,
    params: RequestCampaignSpeciesParamsSchema,
    success: [200, ResponseSpeciesFeaturesSchema],
    handler: controllers.getFeaturesController.handle,
  });
  route(app, {
    method: "GET",
    url: `${catalogItem}/creation-options`,
    operationId: "getCatalogSpeciesCreationOptions",
    permission: campaignRead,
    params: RequestCampaignSpeciesParamsSchema,
    success: [200, ResponseSpeciesCreationOptionsSchema],
    handler: controllers.getCreationOptionsController.handle,
  });
  route(app, {
    method: "POST",
    url: `${catalogItem}/resolve`,
    operationId: "resolveCatalogSpeciesSelection",
    permission: campaignRead,
    params: RequestCampaignSpeciesParamsSchema,
    body: SpeciesSelectionSchema,
    success: [200, ResponseSpeciesSelectionSchema],
    write: true,
    handler: controllers.resolveSelectionController.handle,
  });
  route(app, {
    method: "GET",
    url: `${catalogItem}/usages`,
    operationId: "getCatalogSpeciesUsages",
    permission: campaignUsages,
    params: RequestCampaignSpeciesParamsSchema,
    success: [200, ResponseAssetUsagesSchema],
    handler: controllers.getCatalogUsagesController.handle,
  });
}
