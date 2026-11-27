import type { RequestContext } from "#core/http/requestContext";
import { toPlayerParts } from "#src/modules/items/domain/ItemDefinition";
import type { ResponseItemEffectsDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import {
  type ItemCatalogInput,
  type ItemReader,
  readableItemHeader,
} from "#src/modules/items/useCase/ItemReader";

/** Effects, granted features and spells: what the item does. */
export class GetItemEffectsUseCase {
  constructor(private readonly reader: ItemReader) {}

  async execute(context: RequestContext, input: ItemCatalogInput): Promise<ResponseItemEffectsDto> {
    const readable = await this.reader.read(context, "catalog", input);
    const { definition, isVisible } = await this.reader.definition(readable);
    const visible = toPlayerParts(definition, isVisible);
    const { item } = readable.found;

    return {
      ...readableItemHeader(readable),
      attunementMode: item.attunementMode,
      chargesMaximum: item.chargesMaximum,
      recharge: definition.recharge,
      effects: definition.effects,
      featureGrants: visible.featureGrants,
      spells: visible.spells,
    };
  }
}
