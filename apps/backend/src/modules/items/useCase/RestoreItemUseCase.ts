import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseItemFullDto,
  toItemFullResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import type { ItemContent } from "#src/modules/items/service/ItemsService";

/** Restores an archived item; checked again at the end of the action. */
export class RestoreItemUseCase extends RestoreContentUseCase<ItemContent, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.restore;
  protected readonly toResponse = toItemFullResponse;
}
