import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseItemFullDto,
  toItemFullResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import type { ItemContent } from "#src/modules/items/service/ItemsService";

/** `campaignId` null creates a global item, which only administrators may do. */
export class CreateItemUseCase extends CreateContentUseCase<ItemContent, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.create;
  protected readonly toResponse = toItemFullResponse;
}
