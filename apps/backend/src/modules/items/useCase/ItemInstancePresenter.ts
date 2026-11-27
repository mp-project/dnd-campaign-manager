import type { AppDatabase } from "#core/db/pool";
import { NotFoundError } from "#core/error/http/index";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import {
  type ResponseItemInstanceDto,
  type ResponseItemInstanceFullDto,
  toItemInstanceFullResponse,
  toItemInstancePlayerResponse,
  toItemPlayerResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemInstanceRow } from "#src/modules/items/domain/repository/ItemsRepository";
import { tryParseItemDefinition } from "#src/modules/items/history/TrackedItem";
import {
  effectiveKnowledge,
  type ItemInstancesService,
} from "#src/modules/items/service/ItemInstancesService";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

/**
 * Turns instance rows into responses for one reader: the full view for the GM, editors and
 * administrators, the player view of what the player knows for players. Instances a player doesn't
 * know are missing (404 for a single one).
 */
export class ItemInstancePresenter {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async present(
    access: ContentAccess,
    rows: readonly ItemInstanceRow[],
    db: AppDatabase = this.instances.db,
  ): Promise<ResponseItemInstanceDto[]> {
    const definitions = await this.itemsService.repository.findByAssetIds(
      db,
      rows.map((row) => row.itemAssetId),
    );
    const knowledge = await this.instances.knowledgeOf(
      db,
      rows.map((row) => row.id),
    );

    if (access.isFullView) {
      return rows.flatMap((row) => {
        const definition = definitions.get(row.itemAssetId);

        return definition ? [toItemInstanceFullResponse(row, definition, knowledge.get(row.id) ?? [])] : [];
      });
    }

    const owners = [...(await this.assetsService.findMany(
      rows.flatMap((row) => (row.ownerAssetId === null ? [] : [row.ownerAssetId])),
      db,
    )).values()];
    const visibleOwners = await access.readableIds("READ", owners, db);
    const entries = rows.flatMap((row) => {
      const found = definitions.get(row.itemAssetId);
      const known = effectiveKnowledge(knowledge.get(row.id) ?? [], access.viewer.actorId);

      if (!found || !known) {
        return [];
      }

      // A definition that no longer parses shows only the appearance, until it is fixed.
      const definition = known.knowledgeLevel === "IDENTIFIED" ? tryParseItemDefinition(found.item) : null;

      return [{ row, found, known, definition }];
    });
    // One visibility lookup for the grants and spells of every identified definition on the page.
    const isVisible = await this.itemsService.playerReferenceVisibilityOf(
      entries.flatMap(({ definition }) => (definition ? [definition] : [])),
      access,
      db,
    );
    return entries.map(({ row, found, known, definition }) =>
      toItemInstancePlayerResponse(row, found, known, {
        definition: definition ? toItemPlayerResponse(found, definition, isVisible) : null,
        ownerVisible: row.ownerAssetId !== null && visibleOwners.has(row.ownerAssetId),
      }),
    );
  }

  async presentOne(access: ContentAccess, row: ItemInstanceRow, db?: AppDatabase): Promise<ResponseItemInstanceDto> {
    const [response] = await this.present(access, [row], db);

    if (!response) {
      throw new NotFoundError("Item instance not found");
    }

    return response;
  }

  async full(db: AppDatabase, row: ItemInstanceRow): Promise<ResponseItemInstanceFullDto> {
    const definition = await this.instances.definitionOf(db, row);
    const knowledge = await this.instances.knowledgeOf(db, [row.id]);

    return toItemInstanceFullResponse(row, definition, knowledge.get(row.id) ?? []);
  }
}
