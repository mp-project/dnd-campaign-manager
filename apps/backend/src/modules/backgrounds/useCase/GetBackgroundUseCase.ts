import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseBackgroundDto,
  toBackgroundFullResponse,
  toBackgroundPlayerResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";
import type {
  BackgroundReader,
  BackgroundReadMode,
} from "#src/modules/backgrounds/useCase/BackgroundReader";

/** The whole background; the view depends on who reads it, see `BackgroundReader`. */
export class GetBackgroundUseCase {
  constructor(
    private readonly backgroundsService: BackgroundsService,
    private readonly reader: BackgroundReader,
    private readonly mode: BackgroundReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; backgroundId: string },
  ): Promise<ResponseBackgroundDto> {
    const { found, view, definition } = await this.reader.read(context, this.mode, input);

    if (view === "PLAYER") {
      return toBackgroundPlayerResponse(found, definition);
    }

    return toBackgroundFullResponse(
      await this.backgroundsService.loadRecord(this.backgroundsService.db, found),
    );
  }
}
