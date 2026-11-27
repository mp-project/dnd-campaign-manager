import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseItemDto,
  toItemFullResponse,
  toItemPlayerResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import type { ItemReader, ItemReadMode } from "#src/modules/items/useCase/ItemReader";

export type GetItemInput = { campaignId?: string | undefined; itemId: string };

/** The whole item; the view depends on who reads it, see `ItemReader`. */
export class GetItemUseCase {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly reader: ItemReader,
    private readonly mode: ItemReadMode,
  ) {}

  async execute(context: RequestContext, input: GetItemInput): Promise<ResponseItemDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "FULL") {
      return toItemFullResponse(await this.itemsService.loadRecord(this.itemsService.db, readable.found));
    }

    const { definition, isVisible } = await this.reader.definition(readable);

    return toItemPlayerResponse(readable.found, definition, isVisible);
  }
}
