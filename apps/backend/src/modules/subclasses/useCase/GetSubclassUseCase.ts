import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSubclassDto,
  toSubclassFullResponse,
  toSubclassPlayerResponse,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";
import type { SubclassReader, SubclassReadMode } from "#src/modules/subclasses/useCase/SubclassReader";

/** The whole subclass; the view depends on who reads it, see `SubclassReader`. */
export class GetSubclassUseCase {
  constructor(
    private readonly subclassesService: SubclassesService,
    private readonly reader: SubclassReader,
    private readonly mode: SubclassReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; subclassId: string },
  ): Promise<ResponseSubclassDto> {
    const { found, view, definition } = await this.reader.read(context, this.mode, input);

    if (view === "PLAYER") {
      return toSubclassPlayerResponse(found, definition);
    }

    return toSubclassFullResponse(
      await this.subclassesService.loadRecord(this.subclassesService.db, found),
    );
  }
}
