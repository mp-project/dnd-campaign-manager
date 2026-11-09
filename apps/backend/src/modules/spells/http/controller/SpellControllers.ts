import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateSpellListSchema, CreateSpellSchema } from "#src/modules/spells/domain/dto/CreateSpellDto";
import {
  RequestCampaignParamsSchema,
  RequestCampaignSpellListParamsSchema,
  RequestCampaignSpellListsQuerySchema,
  RequestCampaignSpellParamsSchema,
  RequestCampaignSpellsQuerySchema,
  RequestScopeParamsSchema,
  RequestSpellCatalogQuerySchema,
  RequestSpellListCatalogQuerySchema,
  RequestSpellListParamsSchema,
  RequestSpellParamsSchema,
  RequestSystemSpellListsQuerySchema,
  RequestSystemSpellsQuerySchema,
  ResolveSpellSchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import {
  SpellLifecycleCommandSchema,
  UpdateSpellListSchema,
  UpdateSpellSchema,
} from "#src/modules/spells/domain/dto/UpdateSpellDto";

/** What a handler gets from Fastify; each controller reads only the parts it needs. */
export type SpellRequest = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  requestContext: RequestContext;
};

type UseCase<Input, Output> = { execute(context: RequestContext, input: Input): Promise<Output> };

/**
 * One controller per operation: it parses the request with the operation's schemas and passes the
 * result to its use case. The parsers below are the only difference between the operations.
 */
export class SpellController<Input, Output> extends AbstractController {
  constructor(
    private readonly parse: (request: SpellRequest) => Input,
    private readonly useCase: UseCase<Input, Output>,
  ) {
    super();
  }

  handle = async (request: SpellRequest): Promise<Output> =>
    this.execute(async () => this.useCase.execute(request.requestContext, this.parse(request)));
}

const campaignIdOf = (params: unknown) => RequestScopeParamsSchema.parse(params ?? {}).campaignId ?? null;

const spellPath = (params: unknown) => {
  const { campaignId, spellId } = RequestSpellParamsSchema.parse(params);

  return { campaignId: campaignId ?? null, spellId };
};

const spellListPath = (params: unknown) => {
  const { campaignId, spellListId } = RequestSpellListParamsSchema.parse(params);

  return { campaignId: campaignId ?? null, spellListId };
};

/** Parsers of the spell and spell list routes. */
export const SpellRequests = {
  listCampaign: (request: SpellRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestCampaignSpellsQuerySchema.parse(request.query),
  }),
  listCatalog: (request: SpellRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestSpellCatalogQuerySchema.parse(request.query),
  }),
  listSystem: (request: SpellRequest) => ({ query: RequestSystemSpellsQuerySchema.parse(request.query) }),
  spell: (request: SpellRequest) => RequestSpellParamsSchema.parse(request.params),
  catalogSpell: (request: SpellRequest) => RequestCampaignSpellParamsSchema.parse(request.params),
  resolve: (request: SpellRequest) => ({
    ...RequestCampaignSpellParamsSchema.parse(request.params),
    command: ResolveSpellSchema.parse(request.body ?? {}),
  }),
  create: (request: SpellRequest) => ({
    campaignId: campaignIdOf(request.params),
    command: CreateSpellSchema.parse(request.body),
  }),
  update: (request: SpellRequest) => ({
    ...spellPath(request.params),
    command: UpdateSpellSchema.parse(request.body),
  }),
  /** DELETE sends the version in the query, restore in the body. */
  lifecycle: (source: "query" | "body") => (request: SpellRequest) => ({
    ...spellPath(request.params),
    command: SpellLifecycleCommandSchema.parse(request[source]),
  }),
  validate: (request: SpellRequest) => {
    const { campaignId, spellId } = spellPath(request.params);

    return { campaignId, id: spellId };
  },

  listCampaignLists: (request: SpellRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestCampaignSpellListsQuerySchema.parse(request.query),
  }),
  listListCatalog: (request: SpellRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestSpellListCatalogQuerySchema.parse(request.query),
  }),
  listSystemLists: (request: SpellRequest) => ({
    query: RequestSystemSpellListsQuerySchema.parse(request.query),
  }),
  listSpellsOfList: (request: SpellRequest) => ({
    ...RequestCampaignSpellListParamsSchema.parse(request.params),
    query: RequestSpellCatalogQuerySchema.omit({ list: true }).parse(request.query),
  }),
  spellList: (request: SpellRequest) => RequestSpellListParamsSchema.parse(request.params),
  catalogSpellList: (request: SpellRequest) => RequestCampaignSpellListParamsSchema.parse(request.params),
  createList: (request: SpellRequest) => ({
    campaignId: campaignIdOf(request.params),
    command: CreateSpellListSchema.parse(request.body),
  }),
  updateList: (request: SpellRequest) => ({
    ...spellListPath(request.params),
    command: UpdateSpellListSchema.parse(request.body),
  }),
  listLifecycle: (source: "query" | "body") => (request: SpellRequest) => ({
    ...spellListPath(request.params),
    command: SpellLifecycleCommandSchema.parse(request[source]),
  }),
  validateList: (request: SpellRequest) => {
    const { campaignId, spellListId } = spellListPath(request.params);

    return { campaignId, id: spellListId };
  },
};
