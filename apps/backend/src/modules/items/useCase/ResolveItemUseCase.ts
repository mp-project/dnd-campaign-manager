import type { RequestContext } from "#core/http/requestContext";
import type { ResolveItemDto } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ResponseItemResolutionDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import {
  type ItemCatalogInput,
  type ItemReader,
  type ReadableItem,
  readableItemHeader,
} from "#src/modules/items/useCase/ItemReader";

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
    input: ItemCatalogInput & { command: ResolveItemDto },
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

    return { ...readableItemHeader(readable), instanceId: null, ...resolved } as ResponseItemResolutionDto;
  }
}
