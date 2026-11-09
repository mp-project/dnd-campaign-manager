import type { ContentReadPurpose } from "#core/content/access";
import type { ContentViewer } from "#core/content/viewer";
import type { AppDatabase } from "#core/db/pool";
import { NotFoundError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import type { CreateItemDto, ForkItemDto } from "#src/modules/items/domain/dto/CreateItemDto";
import type {
  RequestCampaignItemsQueryDto,
  RequestItemCatalogQueryDto,
  RequestSystemItemsQueryDto,
  ResolveItemDto,
} from "#src/modules/items/domain/dto/RequestItemDto";
import {
  type ResponseItemDto,
  type ResponseItemEffectsDto,
  type ResponseItemFullDto,
  type ResponseItemListDto,
  type ResponseItemResolutionDto,
  type ResponseUpdateItemDto,
  type ResponseValidationDto,
  toItemFullResponse,
  toItemListItemFullResponse,
  toItemListItemPlayerResponse,
  toItemPageResponse,
  toItemPlayerResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemLifecycleCommandDto, UpdateItemDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { toPlayerParts } from "#src/modules/items/domain/ItemDefinition";
import type { ItemPage } from "#src/modules/items/domain/repository/ItemsRepository";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import type { ItemReader, ItemReadMode, ReadableItem } from "#src/modules/items/useCase/ItemReader";

type Scoped = { campaignId: string | null };
type ItemInput = { campaignId?: string | undefined; itemId: string };
type CatalogInput = { campaignId: string; itemId: string };

const header = (readable: ReadableItem) => ({
  itemId: readable.found.item.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The whole item; the view depends on who reads it, see `ItemReader`. */
export class GetItemUseCase {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly reader: ItemReader,
    private readonly mode: ItemReadMode,
  ) {}

  async execute(context: RequestContext, input: ItemInput): Promise<ResponseItemDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "FULL") {
      return toItemFullResponse(await this.itemsService.loadRecord(this.itemsService.db, readable.found));
    }

    const { definition, isVisible } = await this.reader.definition(readable);

    return toItemPlayerResponse(readable.found, definition, isVisible);
  }
}

/** Effects, granted features and spells: what the item does. */
export class GetItemEffectsUseCase {
  constructor(private readonly reader: ItemReader) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseItemEffectsDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);
    const visible = toPlayerParts(definition, isVisible);
    const { item } = readable.found;

    return {
      ...header(readable),
      attunementMode: item.attunementMode,
      chargesMaximum: item.chargesMaximum,
      recharge: definition.recharge,
      effects: definition.effects,
      featureGrants: visible.featureGrants,
      spells: visible.spells,
    };
  }
}

/**
 * What an item gives an actor described in the body: attack, damage, armor class, effects, spells
 * and granted features, for the state in the body. Nothing is stored.
 */
export class ResolveItemUseCase {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly reader: ItemReader,
  ) {}

  async execute(
    context: RequestContext,
    input: CatalogInput & { command: ResolveItemDto },
  ): Promise<ResponseItemResolutionDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);
    const { command } = input;
    const resolved = await this.itemsService.resolve(readable.found, {
      actor: command.actor,
      state: {
        carried: command.state.carried,
        equipped: command.state.equipped,
        attuned: command.state.attuned,
        currentCharges: command.state.currentCharges ?? null,
      },
      attack: command.attack,
      definition,
      access: readable.access as NonNullable<ReadableItem["access"]>,
      isVisible,
    });

    return { ...header(readable), instanceId: null, ...resolved } as ResponseItemResolutionDto;
  }
}

/** Where an item is used in the campaign, as far as the reader may see it. */
export class GetItemUsagesUseCase {
  constructor(
    private readonly reader: ItemReader,
    private readonly itemsService: ItemsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(context: RequestContext, input: CatalogInput): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Item not found");
    }

    return this.itemsService.getUsages(readable.access, readable.found.asset.id);
  }
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Shared by the list use cases. Lists carry no details; those come with the detail view. */
export class ItemListing {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async listInCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignItemsQueryDto & Partial<Pick<RequestItemCatalogQueryDto, "scope">> },
    purpose: ContentReadPurpose,
  ): Promise<ResponseItemListDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const page = await this.itemsService.repository.listPage(this.itemsService.db, {
      ...this.baseFilter(input.query),
      where: access.listWhere(purpose, { scope: input.query.scope, status: input.query.status }),
    });

    return this.toResponse(page, access.isFullView, input.query.limit);
  }

  async listSystem(context: RequestContext, query: RequestSystemItemsQueryDto): Promise<ResponseItemListDto> {
    this.assetsService.assertAuthenticated(context);

    const page = await this.itemsService.repository.listPage(this.itemsService.db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  private baseFilter(query: RequestCampaignItemsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      category: query.category,
      rarity: query.rarity,
      weaponCategory: query.weaponCategory,
      armorCategory: query.armorCategory,
      magical: query.magical,
      attunement: query.attunement,
      effect: query.effect,
      search: query.search,
    };
  }

  private async toResponse(page: ItemPage, fullView: boolean, limit: number): Promise<ResponseItemListDto> {
    if (!fullView) {
      return toItemPageResponse({ page, data: page.items.map(toItemListItemPlayerResponse), limit });
    }

    const records = await this.itemsService.loadRecords(this.itemsService.db, page.items);

    return toItemPageResponse({ page, data: records.map(toItemListItemFullResponse), limit });
  }
}

/** Custom items of a campaign (`MANAGE`) or what it may use (`CATALOG`). */
export class ListCampaignItemsUseCase {
  constructor(
    private readonly listing: ItemListing,
    private readonly purpose: "MANAGE" | "CATALOG",
  ) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestItemCatalogQueryDto }) {
    return this.listing.listInCampaign(context, input, this.purpose);
  }
}

/** Global items; drafts and archived ones for administrators only. */
export class ListSystemItemsUseCase {
  constructor(private readonly listing: ItemListing) {}

  execute(context: RequestContext, input: { query: RequestSystemItemsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Every write checks the same rule: global items administrators, custom items GMs and editors. */
abstract class ItemMutation<Input extends Scoped, Output> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly itemsService: ItemsService,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.itemsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}

export class CreateItemUseCase extends ItemMutation<Scoped & { command: CreateItemDto }, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.create;

  protected async perform(scope: ActionScope, context: RequestContext, input: Scoped & { command: CreateItemDto }) {
    const actorId = this.itemsService.actorIdOf(context);

    return toItemFullResponse(
      await this.itemsService.createItem(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}

type UpdateInput = Scoped & { itemId: string; command: UpdateItemDto };

export class UpdateItemUseCase extends ItemMutation<UpdateInput, ResponseUpdateItemDto> {
  protected readonly action = ITEM_ACTIONS.update;

  protected async perform(scope: ActionScope, context: RequestContext, input: UpdateInput) {
    const actorId = this.itemsService.actorIdOf(context);
    const found = await this.itemsService.requireScopedItem(scope.tx, input);
    const { record, merged } = await this.itemsService.updateItem(scope, { found, actorId, command: input.command });

    return { ...toItemFullResponse(record), merged };
  }
}

type LifecycleInput = Scoped & { itemId: string; command: ItemLifecycleCommandDto };

/** Archives the item (`archive`) or restores it; archiving fails while content or instances need it. */
export class ChangeItemLifecycleUseCase extends ItemMutation<LifecycleInput, ResponseItemFullDto> {
  protected readonly action: string;

  constructor(
    history: HistoryPort,
    itemsService: ItemsService,
    private readonly archive: boolean,
  ) {
    super(history, itemsService);
    this.action = archive ? ITEM_ACTIONS.delete : ITEM_ACTIONS.restore;
  }

  protected async perform(scope: ActionScope, _context: RequestContext, input: LifecycleInput) {
    const found = await this.itemsService.requireScopedItem(scope.tx, input);

    await this.itemsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: this.archive,
    });

    return toItemFullResponse(
      await this.itemsService.loadRecord(scope.tx, await this.itemsService.requireItem(scope.tx, found.item.id)),
    );
  }
}

type ForkInput = { campaignId: string; itemId: string; command: ForkItemDto };

/**
 * Copies an item of the catalog (global or the campaign's own) into a new custom item of the
 * campaign. The source must be readable in the catalog; the copy is checked like a new item.
 */
export class ForkItemUseCase extends ItemMutation<ForkInput, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.fork;
  /** Viewers resolved before the transaction, so it needs no second connection. */
  private readonly viewers = new WeakMap<ForkInput, ContentViewer>();

  constructor(
    history: HistoryPort,
    itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history, itemsService);
  }

  protected override async prepare(context: RequestContext, input: ForkInput): Promise<void> {
    this.viewers.set(input, await this.assetsService.resolveCampaignViewer(context, input.campaignId));
  }

  protected async perform(scope: ActionScope, context: RequestContext, input: ForkInput) {
    const actorId = this.itemsService.actorIdOf(context);
    const viewer = this.viewers.get(input) as ContentViewer;
    const source = await this.itemsService.requireReadableItem(
      await this.assetsService.accessFor(viewer, scope.tx),
      input.itemId,
      "CATALOG",
      scope.tx,
    );

    return toItemFullResponse(
      await this.itemsService.forkItem(scope, { actorId, campaignId: input.campaignId, source }, input.command),
    );
  }
}

/**
 * Checks a stored item against the current state: schemas, rules across fields, the code per
 * ruleset and the referenced features and spells. Changes nothing.
 */
export class ValidateItemUseCase {
  constructor(private readonly itemsService: ItemsService) {}

  async execute(context: RequestContext, input: { campaignId: string | null; itemId: string }): Promise<ResponseValidationDto> {
    const { db } = this.itemsService;

    await this.itemsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.itemsService.requireScopedItem(db, input);
    const issues = await this.itemsService.validateStored(db, found);

    return { id: input.itemId, valid: issues.length === 0, issues };
  }
}
