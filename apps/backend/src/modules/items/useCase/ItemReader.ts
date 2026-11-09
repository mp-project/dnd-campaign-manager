import type { ContentView } from "#core/content/viewer";
import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import type { ItemDefinitionParts } from "#src/modules/items/domain/dto/ItemDefinitionDto";
import type { ItemWithAsset } from "#src/modules/items/domain/repository/ItemsRepository";
import { readItemDefinition } from "#src/modules/items/history/TrackedItem";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

/**
 * Where an item is read: `campaign` only finds custom items of the campaign, `catalog` also global
 * items for the campaign ruleset, `system` only global items.
 */
export type ItemReadMode = "campaign" | "catalog" | "system";

export type ReadableItem = {
  found: ItemWithAsset;
  view: ContentView;
  /** Null outside a campaign. */
  access: ContentAccess | null;
};

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

    if (mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.itemsService.requireScopedItem(db, { campaignId: null, itemId: input.itemId });

      if (isSysAdminRole(context.systemRole)) {
        return { found, view: "FULL", access: null };
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Item not found");
      }

      return { found, view: "PLAYER", access: null };
    }

    const access = await this.assetsService.access(context, input.campaignId as string);
    const found = await this.itemsService.requireReadableItem(
      access,
      input.itemId,
      mode === "campaign" ? "MANAGE" : "CATALOG",
    );

    return { found, view: access.isFullView ? "FULL" : "PLAYER", access };
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
