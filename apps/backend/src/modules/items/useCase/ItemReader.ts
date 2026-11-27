import type { RequestContext } from "#core/http/requestContext";
import {
  type AssetsService,
  type ContentReadMode,
  type ReadableContent,
  readContent,
} from "#src/modules/assets/index";
import type { ItemDefinitionParts } from "#src/modules/items/domain/dto/ItemDefinitionDto";
import type { ItemWithAsset } from "#src/modules/items/domain/repository/ItemsRepository";
import { readItemDefinition } from "#src/modules/items/history/TrackedItem";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

export type ItemReadMode = ContentReadMode;

export type ReadableItem = ReadableContent<ItemWithAsset>;

/** An item in the catalog of a campaign; the input of the catalog sections. */
export type ItemCatalogInput = { campaignId: string; itemId: string };

/** The ids and the view every catalog section of an item starts with. */
export const readableItemHeader = (readable: ReadableItem) => ({
  itemId: readable.found.item.id,
  assetId: readable.found.asset.id,
  view: readable.view,
});

/**
 * Finds an item for a read route and decides the view. Owners, editors and administrators get the
 * full view, players the player view of active items they may see; outside a campaign,
 * administrators get the full view of global items and everybody else the player view of active
 * ones.
 */
export class ItemReader {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async read(
    context: RequestContext,
    mode: ItemReadMode,
    input: { campaignId?: string | undefined; itemId: string },
  ): Promise<ReadableItem> {
    const { db } = this.itemsService;

    return readContent(this.assetsService, context, mode, input.campaignId, {
      global: () => this.itemsService.requireScopedItem(db, { campaignId: null, itemId: input.itemId }),
      readable: (access, purpose) => this.itemsService.requireReadableItem(access, input.itemId, purpose),
      notFound: "Item not found",
    });
  }

  /** The stored definition (409 if it no longer parses) and what of it the reader may see. */
  async definition(
    readable: ReadableItem,
  ): Promise<{ definition: ItemDefinitionParts; isVisible: (assetId: string) => boolean }> {
    const definition = readItemDefinition(readable.found.item);

    if (readable.view === "FULL") {
      return { definition, isVisible: () => true };
    }

    return {
      definition,
      isVisible: await this.itemsService.playerReferenceVisibility(definition, readable.access),
    };
  }
}
