import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseFeatDto,
  toFeatFullResponse,
  toFeatPlayerResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";
import type { FeatReader, FeatReadMode } from "#src/modules/feats/useCase/FeatReader";

export type GetFeatInput = { campaignId?: string | undefined; featId: string };

/** The whole feat; the view depends on who reads it, see `FeatReader`. */
export class GetFeatUseCase {
  constructor(
    private readonly featsService: FeatsService,
    private readonly reader: FeatReader,
    private readonly mode: FeatReadMode,
  ) {}

  async execute(context: RequestContext, input: GetFeatInput): Promise<ResponseFeatDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "FULL") {
      return toFeatFullResponse(await this.featsService.loadRecord(this.featsService.db, readable.found));
    }

    const { definition, isVisible } = await this.reader.definition(readable);

    return toFeatPlayerResponse(readable.found, definition, isVisible);
  }
}
