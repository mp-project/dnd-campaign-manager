import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseItemFullDto,
  toItemFullResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import type { ItemContent } from "#src/modules/items/service/ItemsService";

/** Changes the item and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateItemUseCase extends UpdateContentUseCase<ItemContent, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.update;
  protected readonly toResponse = toItemFullResponse;
}
