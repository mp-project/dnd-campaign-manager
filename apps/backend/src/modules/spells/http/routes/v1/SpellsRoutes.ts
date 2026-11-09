import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

import { errorResponseDto } from "#core/http/dto";
import { ResponseAssetUsagesSchema } from "#src/modules/asset-links/index";
import { CreateSpellListSchema, CreateSpellSchema } from "#src/modules/spells/domain/dto/CreateSpellDto";
import {
  RequestCampaignParamsSchema,
  RequestCampaignSpellListParamsSchema,
  RequestCampaignSpellListsQuerySchema,
  RequestCampaignSpellParamsSchema,
  RequestCampaignSpellsQuerySchema,
  RequestSpellCatalogQuerySchema,
  RequestSpellListCatalogQuerySchema,
  RequestSystemSpellListParamsSchema,
  RequestSystemSpellListsQuerySchema,
  RequestSystemSpellParamsSchema,
  RequestSystemSpellsQuerySchema,
  ResolveSpellSchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import {
  ResponseSpellEffectsSchema,
  ResponseSpellFullSchema,
  ResponseSpellListDetailSchema,
  ResponseSpellListFullSchema,
  ResponseSpellListListSchema,
  ResponseSpellListSchema,
  ResponseSpellListsOfSpellSchema,
  ResponseSpellResolutionSchema,
  ResponseSpellSchema,
  ResponseUpdateSpellListSchema,
  ResponseUpdateSpellSchema,
  ResponseValidationSchema,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import {
  SpellLifecycleCommandSchema,
  UpdateSpellListSchema,
  UpdateSpellSchema,
} from "#src/modules/spells/domain/dto/UpdateSpellDto";
import type { SpellRequest } from "#src/modules/spells/http/controller/SpellControllers";
import { SPELLS_PERMISSIONS } from "#src/modules/spells/permissions/SpellsPermissions";

type Handler = { handle(request: SpellRequest): Promise<unknown> };

/** The controllers of all spell and spell list routes, keyed like the routes below. */
export type SpellsRouteControllers = Record<
  | "listCampaignSpells"
  | "createCampaignSpell"
  | "getCampaignSpell"
  | "updateCampaignSpell"
  | "deleteCampaignSpell"
  | "restoreCampaignSpell"
  | "validateCampaignSpell"
  | "getCampaignSpellUsages"
  | "listSpellCatalog"
  | "getCatalogSpell"
  | "getCatalogSpellEffects"
  | "getCatalogSpellLists"
  | "getCatalogSpellUsages"
  | "resolveSpell"
  | "listSystemSpells"
  | "createSystemSpell"
  | "getSystemSpell"
  | "updateSystemSpell"
  | "deleteSystemSpell"
  | "restoreSystemSpell"
  | "validateSystemSpell"
  | "listCampaignSpellLists"
  | "createCampaignSpellList"
  | "getCampaignSpellList"
  | "updateCampaignSpellList"
  | "deleteCampaignSpellList"
  | "restoreCampaignSpellList"
  | "validateCampaignSpellList"
  | "getCampaignSpellListUsages"
  | "listSpellListCatalog"
  | "getCatalogSpellList"
  | "listCatalogSpellListSpells"
  | "getCatalogSpellListUsages"
  | "listSystemSpellLists"
  | "createSystemSpellList"
  | "getSystemSpellList"
  | "updateSystemSpellList"
  | "deleteSystemSpellList"
  | "restoreSystemSpellList"
  | "validateSystemSpellList",
  Handler
>;

const security = [{ cookieAuth: [] }] as const;

const readErrorResponses = {
  400: errorResponseDto,
  401: errorResponseDto,
  403: errorResponseDto,
  404: errorResponseDto,
} as const;

/** Reads answer 409 when the stored definition no longer parses. */
const definitionReadErrorResponses = { ...readErrorResponses, 409: errorResponseDto } as const;

const writeErrorResponses = {
  ...readErrorResponses,
  409: errorResponseDto,
  412: errorResponseDto,
} as const;

const P = SPELLS_PERMISSIONS;
const campaignRead = { key: P.read, hideAsNotFoundForPlayers: true };
const campaignUsages = { key: P.readUsages, hideAsNotFoundForPlayers: true };
const campaignResolve = { key: P.resolve, hideAsNotFoundForPlayers: true };

type RouteSpec = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  operationId: keyof SpellsRouteControllers;
  permission: { key: string; hideAsNotFoundForPlayers?: boolean };
  tag: "Spells" | "Spell lists";
  params?: ZodType;
  querystring?: ZodType;
  body?: ZodType;
  status?: 200 | 201;
  response: ZodType;
  errors: Record<number, ZodType>;
};

/** The routes of one kind of content in one place: campaign, catalog or global. */
function contentRoutes(input: {
  kind: "Spell" | "SpellList";
  tag: RouteSpec["tag"];
  base: string;
  idParam: string;
  campaign: boolean;
  params: ZodType;
  itemParams: ZodType;
  listQuery: ZodType;
  list: ZodType;
  create: ZodType;
  full: ZodType;
  detail: ZodType;
  update: ZodType;
  updated: ZodType;
}): RouteSpec[] {
  const scope = input.campaign ? "Campaign" : "System";
  const item = `${input.base}/:${input.idParam}`;
  const id = (name: string) => `${name}${scope}${input.kind}` as keyof SpellsRouteControllers;
  const withParams = input.campaign ? { params: input.params } : {};
  const routes: RouteSpec[] = [
    {
      method: "GET",
      url: input.base,
      operationId: `list${scope}${input.kind === "Spell" ? "Spells" : "SpellLists"}` as keyof SpellsRouteControllers,
      permission: input.campaign ? campaignRead : { key: P.read },
      tag: input.tag,
      ...withParams,
      querystring: input.listQuery,
      response: input.list,
      errors: readErrorResponses,
    },
    {
      method: "POST",
      url: input.base,
      operationId: id("create"),
      permission: { key: P.create },
      tag: input.tag,
      ...withParams,
      body: input.create,
      status: 201,
      response: input.full,
      errors: writeErrorResponses,
    },
    {
      method: "GET",
      url: item,
      operationId: id("get"),
      permission: input.campaign ? campaignRead : { key: P.read },
      tag: input.tag,
      params: input.itemParams,
      response: input.detail,
      errors: definitionReadErrorResponses,
    },
    {
      method: "PATCH",
      url: item,
      operationId: id("update"),
      permission: { key: P.update },
      tag: input.tag,
      params: input.itemParams,
      body: input.update,
      response: input.updated,
      errors: writeErrorResponses,
    },
    {
      method: "DELETE",
      url: item,
      operationId: id("delete"),
      permission: { key: P.delete },
      tag: input.tag,
      params: input.itemParams,
      querystring: SpellLifecycleCommandSchema,
      response: input.full,
      errors: writeErrorResponses,
    },
    {
      method: "POST",
      url: `${item}/restore`,
      operationId: id("restore"),
      permission: { key: P.restore },
      tag: input.tag,
      params: input.itemParams,
      body: SpellLifecycleCommandSchema,
      response: input.full,
      errors: writeErrorResponses,
    },
    {
      method: "POST",
      url: `${item}/validate`,
      operationId: id("validate"),
      permission: { key: P.validate },
      tag: input.tag,
      params: input.itemParams,
      response: ResponseValidationSchema,
      errors: readErrorResponses,
    },
  ];

  if (input.campaign) {
    routes.push({
      method: "GET",
      url: `${item}/usages`,
      operationId: `getCampaign${input.kind}Usages` as keyof SpellsRouteControllers,
      permission: campaignUsages,
      tag: input.tag,
      params: input.itemParams,
      response: ResponseAssetUsagesSchema,
      errors: readErrorResponses,
    });
  }

  return routes;
}

const spellRoutes = (campaign: boolean) =>
  contentRoutes({
    kind: "Spell",
    tag: "Spells",
    base: campaign ? "/campaigns/:campaignId/spells" : "/spells",
    idParam: "spellId",
    campaign,
    params: RequestCampaignParamsSchema,
    itemParams: campaign ? RequestCampaignSpellParamsSchema : RequestSystemSpellParamsSchema,
    listQuery: campaign ? RequestCampaignSpellsQuerySchema : RequestSystemSpellsQuerySchema,
    list: ResponseSpellListSchema,
    create: CreateSpellSchema,
    full: ResponseSpellFullSchema,
    detail: ResponseSpellSchema,
    update: UpdateSpellSchema,
    updated: ResponseUpdateSpellSchema,
  });

const spellListRoutes = (campaign: boolean) =>
  contentRoutes({
    kind: "SpellList",
    tag: "Spell lists",
    base: campaign ? "/campaigns/:campaignId/spell-lists" : "/spell-lists",
    idParam: "spellListId",
    campaign,
    params: RequestCampaignParamsSchema,
    itemParams: campaign ? RequestCampaignSpellListParamsSchema : RequestSystemSpellListParamsSchema,
    listQuery: campaign ? RequestCampaignSpellListsQuerySchema : RequestSystemSpellListsQuerySchema,
    list: ResponseSpellListListSchema,
    create: CreateSpellListSchema,
    full: ResponseSpellListFullSchema,
    detail: ResponseSpellListDetailSchema,
    update: UpdateSpellListSchema,
    updated: ResponseUpdateSpellListSchema,
  });

const catalogSpell = "/campaigns/:campaignId/catalog/spells/:spellId";
const catalogSpellList = "/campaigns/:campaignId/catalog/spell-lists/:spellListId";

/** What a campaign may use: spells and spell lists of the catalog, with their sections. */
const catalogRoutes: RouteSpec[] = [
  {
    method: "GET",
    url: "/campaigns/:campaignId/catalog/spells",
    operationId: "listSpellCatalog",
    permission: campaignRead,
    tag: "Spells",
    params: RequestCampaignParamsSchema,
    querystring: RequestSpellCatalogQuerySchema,
    response: ResponseSpellListSchema,
    errors: readErrorResponses,
  },
  {
    method: "GET",
    url: catalogSpell,
    operationId: "getCatalogSpell",
    permission: campaignRead,
    tag: "Spells",
    params: RequestCampaignSpellParamsSchema,
    response: ResponseSpellSchema,
    errors: definitionReadErrorResponses,
  },
  {
    method: "GET",
    url: `${catalogSpell}/effects`,
    operationId: "getCatalogSpellEffects",
    permission: campaignRead,
    tag: "Spells",
    params: RequestCampaignSpellParamsSchema,
    response: ResponseSpellEffectsSchema,
    errors: definitionReadErrorResponses,
  },
  {
    method: "GET",
    url: `${catalogSpell}/lists`,
    operationId: "getCatalogSpellLists",
    permission: campaignRead,
    tag: "Spells",
    params: RequestCampaignSpellParamsSchema,
    response: ResponseSpellListsOfSpellSchema,
    errors: readErrorResponses,
  },
  {
    method: "GET",
    url: `${catalogSpell}/usages`,
    operationId: "getCatalogSpellUsages",
    permission: campaignUsages,
    tag: "Spells",
    params: RequestCampaignSpellParamsSchema,
    response: ResponseAssetUsagesSchema,
    errors: readErrorResponses,
  },
  {
    method: "POST",
    url: `${catalogSpell}/resolve`,
    operationId: "resolveSpell",
    permission: campaignResolve,
    tag: "Spells",
    params: RequestCampaignSpellParamsSchema,
    body: ResolveSpellSchema,
    response: ResponseSpellResolutionSchema,
    errors: definitionReadErrorResponses,
  },
  {
    method: "GET",
    url: "/campaigns/:campaignId/catalog/spell-lists",
    operationId: "listSpellListCatalog",
    permission: campaignRead,
    tag: "Spell lists",
    params: RequestCampaignParamsSchema,
    querystring: RequestSpellListCatalogQuerySchema,
    response: ResponseSpellListListSchema,
    errors: readErrorResponses,
  },
  {
    method: "GET",
    url: catalogSpellList,
    operationId: "getCatalogSpellList",
    permission: campaignRead,
    tag: "Spell lists",
    params: RequestCampaignSpellListParamsSchema,
    response: ResponseSpellListDetailSchema,
    errors: readErrorResponses,
  },
  {
    method: "GET",
    url: `${catalogSpellList}/spells`,
    operationId: "listCatalogSpellListSpells",
    permission: campaignRead,
    tag: "Spell lists",
    params: RequestCampaignSpellListParamsSchema,
    querystring: RequestSpellCatalogQuerySchema.omit({ list: true }),
    response: ResponseSpellListSchema,
    errors: readErrorResponses,
  },
  {
    method: "GET",
    url: `${catalogSpellList}/usages`,
    operationId: "getCatalogSpellListUsages",
    permission: campaignUsages,
    tag: "Spell lists",
    params: RequestCampaignSpellListParamsSchema,
    response: ResponseAssetUsagesSchema,
    errors: readErrorResponses,
  },
];

/**
 * Custom spells and lists under `/campaigns/:campaignId/spells` and `/spell-lists`, the catalog of
 * what a campaign may use under `/campaigns/:campaignId/catalog/…` (with sections and the
 * resolution of a cast), global content under `/spells` and `/spell-lists`. Global content uses the
 * same permissions; the use case only lets administrators change it. The parts of a definition are
 * replaced with `PATCH`, there are no separate routes per part.
 */
export function registerSpellsRoutes(app: FastifyInstance, controllers: SpellsRouteControllers): void {
  const routes = [
    ...spellRoutes(true),
    ...catalogRoutes,
    ...spellRoutes(false),
    ...spellListRoutes(true),
    ...spellListRoutes(false),
  ];

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
      handler: async (request: FastifyRequest, reply: FastifyReply) =>
        reply.code(status).send(await controller.handle(request as unknown as SpellRequest)),
    });
  }
}
