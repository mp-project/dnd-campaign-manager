import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseItemFullDto,
  toItemFullResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import type { ItemContent } from "#src/modules/items/service/ItemsService";

/** Archives the item; it can be restored. Fails while content or instances need it. */
export class DeleteItemUseCase extends ArchiveContentUseCase<ItemContent, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.delete;
  protected readonly toResponse = toItemFullResponse;
}
