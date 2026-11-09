import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z, type ZodType } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateItemSchema, ForkItemSchema } from "#src/modules/items/domain/dto/CreateItemDto";
import {
  RequestCampaignItemParamsSchema,
  RequestCampaignItemsQuerySchema,
  RequestCampaignParamsSchema,
  RequestItemCatalogQuerySchema,
  RequestItemInstanceParamsSchema,
  RequestItemInstancesQuerySchema,
  RequestSystemItemParamsSchema,
  RequestSystemItemsQuerySchema,
  ResolveItemInstanceSchema,
  ResolveItemSchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import {
  ResponseItemEffectsSchema,
  ResponseItemFullSchema,
  ResponseItemInstanceFullSchema,
  ResponseItemInstanceListSchema,
  ResponseItemInstanceSchema,
  ResponseItemKnowledgeSchema,
  ResponseItemListSchema,
  ResponseItemResolutionSchema,
  ResponseItemSchema,
  ResponseItemSplitSchema,
  ResponseItemTransferSchema,
  ResponseUpdateItemSchema,
  ResponseValidationSchema,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import {
  AdjustItemQuantitySchema,
  AttuneItemInstanceSchema,
  CreateItemInstanceSchema,
  DeleteItemInstanceSchema,
  EquipItemInstanceSchema,
  IdentifyItemInstanceSchema,
  MergeItemInstancesSchema,
  SplitItemInstanceSchema,
  ItemLifecycleCommandSchema,
  SpendItemChargeSchema,
  TransferItemInstanceSchema,
  UpdateItemInstanceSchema,
  UpdateItemSchema,
} from "#src/modules/items/domain/dto/UpdateItemDto";
import type { ItemRequest } from "#src/modules/items/http/controller/ItemControllers";
import { ITEM_INSTANCES_PERMISSIONS, ITEMS_PERMISSIONS } from "#src/modules/items/permissions/ItemsPermissions";

type Handler = { handle(request: ItemRequest): Promise<unknown> };

export const ITEM_ROUTE_IDS = [
  "listCampaignItems",
  "createCampaignItem",
  "getCampaignItem",
  "updateCampaignItem",
  "deleteCampaignItem",
  "restoreCampaignItem",
  "validateCampaignItem",
  "getCampaignItemUsages",
  "listItemCatalog",
  "getCatalogItem",
  "getCatalogItemEffects",
  "getCatalogItemUsages",
  "listCatalogItemInstances",
  "resolveItem",
  "forkItem",
  "listSystemItems",
  "createSystemItem",
  "getSystemItem",
  "updateSystemItem",
  "deleteSystemItem",
  "restoreSystemItem",
  "validateSystemItem",
  "listItemInstances",
  "createItemInstance",
  "getItemInstance",
  "updateItemInstance",
  "deleteItemInstance",
  "transferItemInstance",
  "splitItemInstance",
  "mergeItemInstances",
  "adjustItemInstanceQuantity",
  "equipItemInstance",
  "attuneItemInstance",
  "spendItemInstanceCharge",
  "identifyItemInstance",
  "resolveItemInstance",
] as const;

/** The controllers of all item routes, keyed like the routes below. */
export type ItemsRouteControllers = Record<(typeof ITEM_ROUTE_IDS)[number], Handler>;

const security = [{ cookieAuth: [] }] as const;

const readErrors = {
  400: errorResponseDto,
  401: errorResponseDto,
  403: errorResponseDto,
  404: errorResponseDto,
} as const;

/** Reads answer 409 when the stored definition no longer parses. */
const definitionReadErrors = { ...readErrors, 409: errorResponseDto } as const;
const writeErrors = { ...readErrors, 409: errorResponseDto, 412: errorResponseDto } as const;

const P = ITEMS_PERMISSIONS;
const IP = ITEM_INSTANCES_PERMISSIONS;
const hidden = (key: string) => ({ key, hideAsNotFoundForPlayers: true });

type RouteSpec = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  operationId: keyof ItemsRouteControllers;
  permission: { key: string; hideAsNotFoundForPlayers?: boolean };
  tag: "Items" | "Item instances";
  params?: ZodType;
  querystring?: ZodType;
  body?: ZodType;
  status?: 200 | 201 | 204;
  response: ZodType;
  errors: Record<number, ZodType>;
};

function definitionRoutes(campaign: boolean): RouteSpec[] {
  const scope = campaign ? "Campaign" : "System";
  const base = campaign ? "/campaigns/:campaignId/items" : "/items";
  const item = `${base}/:itemId`;
  const itemParams = campaign ? RequestCampaignItemParamsSchema : RequestSystemItemParamsSchema;
  const id = (name: string) => `${name}${scope}Item` as keyof ItemsRouteControllers;
  const read = campaign ? hidden(P.read) : { key: P.read };
  const routes: RouteSpec[] = [
    {
      method: "GET",
      url: base,
      operationId: `list${scope}Items` as keyof ItemsRouteControllers,
      permission: read,
      tag: "Items",
      ...(campaign ? { params: RequestCampaignParamsSchema } : {}),
      querystring: campaign ? RequestCampaignItemsQuerySchema : RequestSystemItemsQuerySchema,
      response: ResponseItemListSchema,
      errors: readErrors,
    },
    {
      method: "POST",
      url: base,
      operationId: id("create"),
      permission: { key: P.create },
      tag: "Items",
      ...(campaign ? { params: RequestCampaignParamsSchema } : {}),
      body: CreateItemSchema,
      status: 201,
      response: ResponseItemFullSchema,
      errors: writeErrors,
    },
    {
      method: "GET",
      url: item,
      operationId: id("get"),
      permission: read,
      tag: "Items",
      params: itemParams,
      response: ResponseItemSchema,
      errors: definitionReadErrors,
    },
    {
      method: "PATCH",
      url: item,
      operationId: id("update"),
      permission: { key: P.update },
      tag: "Items",
      params: itemParams,
      body: UpdateItemSchema,
      response: ResponseUpdateItemSchema,
      errors: writeErrors,
    },
    {
      method: "DELETE",
      url: item,
      operationId: id("delete"),
      permission: { key: P.delete },
      tag: "Items",
      params: itemParams,
      querystring: ItemLifecycleCommandSchema,
      response: ResponseItemFullSchema,
      errors: writeErrors,
    },
    {
      method: "POST",
      url: `${item}/restore`,
      operationId: id("restore"),
      permission: { key: P.restore },
      tag: "Items",
      params: itemParams,
      body: ItemLifecycleCommandSchema,
      response: ResponseItemFullSchema,
      errors: writeErrors,
    },
    {
      method: "POST",
      url: `${item}/validate`,
      operationId: id("validate"),
      permission: { key: P.validate },
      tag: "Items",
      params: itemParams,
      response: ResponseValidationSchema,
      errors: readErrors,
    },
  ];

  if (campaign) {
    routes.push({
      method: "GET",
      url: `${item}/usages`,
      operationId: "getCampaignItemUsages",
      permission: hidden(P.readUsages),
      tag: "Items",
      params: itemParams,
      response: ResponseAssetUsagesSchema,
      errors: readErrors,
    });
  }

  return routes;
}

const catalogItem = "/campaigns/:campaignId/catalog/items/:itemId";

/** What a campaign may use, with its sections, the calculation and forking. */
const catalogRoutes: RouteSpec[] = [
  {
    method: "GET",
    url: "/campaigns/:campaignId/catalog/items",
    operationId: "listItemCatalog",
    permission: hidden(P.read),
    tag: "Items",
    params: RequestCampaignParamsSchema,
    querystring: RequestItemCatalogQuerySchema,
    response: ResponseItemListSchema,
    errors: readErrors,
  },
  {
    method: "GET",
    url: catalogItem,
    operationId: "getCatalogItem",
    permission: hidden(P.read),
    tag: "Items",
    params: RequestCampaignItemParamsSchema,
    response: ResponseItemSchema,
    errors: definitionReadErrors,
  },
  {
    method: "GET",
    url: `${catalogItem}/effects`,
    operationId: "getCatalogItemEffects",
    permission: hidden(P.read),
    tag: "Items",
    params: RequestCampaignItemParamsSchema,
    response: ResponseItemEffectsSchema,
    errors: definitionReadErrors,
  },
  {
    method: "GET",
    url: `${catalogItem}/usages`,
    operationId: "getCatalogItemUsages",
    permission: hidden(P.readUsages),
    tag: "Items",
    params: RequestCampaignItemParamsSchema,
    response: ResponseAssetUsagesSchema,
    errors: readErrors,
  },
  {
    method: "GET",
    url: `${catalogItem}/instances`,
    operationId: "listCatalogItemInstances",
    permission: hidden(IP.read),
    tag: "Items",
    params: RequestCampaignItemParamsSchema,
    querystring: RequestItemInstancesQuerySchema.omit({ itemAssetId: true }),
    response: ResponseItemInstanceListSchema,
    errors: readErrors,
  },
  {
    method: "POST",
    url: `${catalogItem}/resolve`,
    operationId: "resolveItem",
    permission: hidden(P.resolve),
    tag: "Items",
    params: RequestCampaignItemParamsSchema,
    body: ResolveItemSchema,
    response: ResponseItemResolutionSchema,
    errors: definitionReadErrors,
  },
  {
    method: "POST",
    url: `${catalogItem}/fork`,
    operationId: "forkItem",
    permission: { key: P.fork },
    tag: "Items",
    params: RequestCampaignItemParamsSchema,
    body: ForkItemSchema,
    status: 201,
    response: ResponseItemFullSchema,
    errors: writeErrors,
  },
];

const instances = "/campaigns/:campaignId/item-instances";
const instance = `${instances}/:instanceId`;

const command = (
  name: string,
  operationId: keyof ItemsRouteControllers,
  key: string,
  body: ZodType,
  response: ZodType = ResponseItemInstanceFullSchema,
): RouteSpec => ({
  method: "POST",
  url: `${instance}/${name}`,
  operationId,
  permission: { key },
  tag: "Item instances",
  params: RequestItemInstanceParamsSchema,
  body,
  response,
  errors: writeErrors,
});

/** Instances of a campaign and their commands; each command sends the version it saw. */
const instanceRoutes: RouteSpec[] = [
  {
    method: "GET",
    url: instances,
    operationId: "listItemInstances",
    permission: hidden(IP.read),
    tag: "Item instances",
    params: RequestCampaignParamsSchema,
    querystring: RequestItemInstancesQuerySchema,
    response: ResponseItemInstanceListSchema,
    errors: readErrors,
  },
  {
    method: "POST",
    url: instances,
    operationId: "createItemInstance",
    permission: { key: IP.create },
    tag: "Item instances",
    params: RequestCampaignParamsSchema,
    body: CreateItemInstanceSchema,
    status: 201,
    response: ResponseItemInstanceFullSchema,
    errors: writeErrors,
  },
  {
    method: "GET",
    url: instance,
    operationId: "getItemInstance",
    permission: hidden(IP.read),
    tag: "Item instances",
    params: RequestItemInstanceParamsSchema,
    response: ResponseItemInstanceSchema,
    errors: readErrors,
  },
  {
    method: "PATCH",
    url: instance,
    operationId: "updateItemInstance",
    permission: { key: IP.update },
    tag: "Item instances",
    params: RequestItemInstanceParamsSchema,
    body: UpdateItemInstanceSchema,
    response: ResponseItemInstanceFullSchema,
    errors: writeErrors,
  },
  {
    method: "DELETE",
    url: instance,
    operationId: "deleteItemInstance",
    permission: { key: IP.delete },
    tag: "Item instances",
    params: RequestItemInstanceParamsSchema,
    querystring: DeleteItemInstanceSchema,
    status: 204,
    response: z.null(),
    errors: writeErrors,
  },
  command("transfer", "transferItemInstance", IP.transfer, TransferItemInstanceSchema, ResponseItemTransferSchema),
  command("split", "splitItemInstance", IP.update, SplitItemInstanceSchema, ResponseItemSplitSchema),
  command("merge", "mergeItemInstances", IP.update, MergeItemInstancesSchema),
  command("adjust-quantity", "adjustItemInstanceQuantity", IP.update, AdjustItemQuantitySchema),
  command("equip", "equipItemInstance", IP.equip, EquipItemInstanceSchema),
  command("attune", "attuneItemInstance", IP.attune, AttuneItemInstanceSchema),
  command("spend-charge", "spendItemInstanceCharge", IP.update, SpendItemChargeSchema),
  command("identify", "identifyItemInstance", IP.identify, IdentifyItemInstanceSchema, ResponseItemKnowledgeSchema),
  {
    method: "POST",
    url: `${instance}/resolve`,
    operationId: "resolveItemInstance",
    permission: hidden(IP.read),
    tag: "Item instances",
    params: RequestItemInstanceParamsSchema,
    body: ResolveItemInstanceSchema,
    response: ResponseItemResolutionSchema,
    errors: definitionReadErrors,
  },
];

/**
 * Custom items under `/campaigns/:campaignId/items`, the catalog of what a campaign may use under
 * `/campaigns/:campaignId/catalog/items` (with effects, usages, instances, the calculation for an
 * actor and forking), global items under `/items`, and instances under
 * `/campaigns/:campaignId/item-instances` with their commands. Global items use the same
 * permissions; the use case only lets administrators change them.
 */
export function registerItemsRoutes(app: FastifyInstance, controllers: ItemsRouteControllers): void {
  const routes = [...definitionRoutes(true), ...catalogRoutes, ...definitionRoutes(false), ...instanceRoutes];

  for (const route of routes) {
    const controller = controllers[route.operationId];
    const status = route.status ?? 200;

    app.route({
      method: route.method,
      url: route.url,
      config: { permission: route.permission },
      schema: {
        tags: [route.tag],
        operationId: route.operationId,
        security,
        ...(route.params ? { params: route.params } : {}),
        ...(route.querystring ? { querystring: route.querystring } : {}),
        ...(route.body ? { body: route.body } : {}),
        response: { [status]: route.response, ...route.errors },
      },
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        const result = await controller.handle(request as unknown as ItemRequest);

        return status === 204 ? reply.code(204).send() : reply.code(status).send(result);
      },
    });
  }
}
