import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateItemSchema, ForkItemSchema } from "#src/modules/items/domain/dto/CreateItemDto";
import {
  RequestCampaignItemParamsSchema,
  RequestCampaignItemsQuerySchema,
  RequestCampaignParamsSchema,
  RequestItemCatalogQuerySchema,
  RequestItemInstanceParamsSchema,
  RequestItemInstancesQuerySchema,
  RequestItemParamsSchema,
  RequestScopeParamsSchema,
  RequestSystemItemsQuerySchema,
  ResolveItemInstanceSchema,
  ResolveItemSchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
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

/** What a handler gets from Fastify; each controller reads only the parts it needs. */
export type ItemRequest = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  requestContext: RequestContext;
};

type UseCase<Input, Output> = { execute(context: RequestContext, input: Input): Promise<Output> };

/**
 * One controller per operation: it parses the request with the operation's schemas and passes the
 * result to its use case.
 */
export class ItemController<Input, Output> extends AbstractController {
  constructor(
    private readonly parse: (request: ItemRequest) => Input,
    private readonly useCase: UseCase<Input, Output>,
  ) {
    super();
  }

  handle = async (request: ItemRequest): Promise<Output> =>
    this.execute(async () => this.useCase.execute(request.requestContext, this.parse(request)));
}

const campaignIdOf = (params: unknown) => RequestScopeParamsSchema.parse(params ?? {}).campaignId ?? null;

const itemPath = (params: unknown) => {
  const { campaignId, itemId } = RequestItemParamsSchema.parse(params);

  return { campaignId: campaignId ?? null, itemId };
};

const instancePath = (params: unknown) => RequestItemInstanceParamsSchema.parse(params);

/** Parsers of the item routes. */
export const ItemRequests = {
  listCampaign: (request: ItemRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestCampaignItemsQuerySchema.parse(request.query),
  }),
  listCatalog: (request: ItemRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestItemCatalogQuerySchema.parse(request.query),
  }),
  listSystem: (request: ItemRequest) => ({ query: RequestSystemItemsQuerySchema.parse(request.query) }),
  item: (request: ItemRequest) => RequestItemParamsSchema.parse(request.params),
  catalogItem: (request: ItemRequest) => RequestCampaignItemParamsSchema.parse(request.params),
  resolve: (request: ItemRequest) => ({
    ...RequestCampaignItemParamsSchema.parse(request.params),
    command: ResolveItemSchema.parse(request.body ?? {}),
  }),
  fork: (request: ItemRequest) => ({
    ...RequestCampaignItemParamsSchema.parse(request.params),
    command: ForkItemSchema.parse(request.body ?? {}),
  }),
  instancesOfItem: (request: ItemRequest) => ({
    ...RequestCampaignItemParamsSchema.parse(request.params),
    query: RequestItemInstancesQuerySchema.omit({ itemAssetId: true }).parse(request.query),
  }),
  create: (request: ItemRequest) => ({
    campaignId: campaignIdOf(request.params),
    command: CreateItemSchema.parse(request.body),
  }),
  update: (request: ItemRequest) => ({ ...itemPath(request.params), command: UpdateItemSchema.parse(request.body) }),
  /** DELETE sends the version in the query, restore in the body. */
  lifecycle: (source: "query" | "body") => (request: ItemRequest) => ({
    ...itemPath(request.params),
    command: ItemLifecycleCommandSchema.parse(request[source]),
  }),
  validate: (request: ItemRequest) => itemPath(request.params),

  listInstances: (request: ItemRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    query: RequestItemInstancesQuerySchema.parse(request.query),
  }),
  instance: (request: ItemRequest) => instancePath(request.params),
  createInstance: (request: ItemRequest) => ({
    ...RequestCampaignParamsSchema.parse(request.params),
    command: CreateItemInstanceSchema.parse(request.body),
  }),
  updateInstance: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: UpdateItemInstanceSchema.parse(request.body),
  }),
  deleteInstance: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: DeleteItemInstanceSchema.parse(request.query),
  }),
  transfer: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: TransferItemInstanceSchema.parse(request.body),
  }),
  split: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: SplitItemInstanceSchema.parse(request.body),
  }),
  merge: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: MergeItemInstancesSchema.parse(request.body),
  }),
  adjustQuantity: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: AdjustItemQuantitySchema.parse(request.body),
  }),
  equip: (request: ItemRequest) => ({ ...instancePath(request.params), command: EquipItemInstanceSchema.parse(request.body) }),
  attune: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: AttuneItemInstanceSchema.parse(request.body),
  }),
  spendCharge: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: SpendItemChargeSchema.parse(request.body),
  }),
  identify: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: IdentifyItemInstanceSchema.parse(request.body),
  }),
  resolveInstance: (request: ItemRequest) => ({
    ...instancePath(request.params),
    command: ResolveItemInstanceSchema.parse(request.body ?? {}),
  }),
};
