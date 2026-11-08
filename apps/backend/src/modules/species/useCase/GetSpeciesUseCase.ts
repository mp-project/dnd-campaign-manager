import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpeciesDto,
  toSpeciesGmResponse,
  toSpeciesPlayerResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesReader, SpeciesReadMode } from "#src/modules/species/useCase/SpeciesReader";

/** The whole species without its variants; the view depends on who reads it, see `SpeciesReader`. */
export class GetSpeciesUseCase {
  constructor(
    private readonly speciesService: SpeciesService,
    private readonly reader: SpeciesReader,
    private readonly mode: SpeciesReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; speciesId: string },
  ): Promise<ResponseSpeciesDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "PLAYER") {
      return toSpeciesPlayerResponse(readable.found, await this.reader.visibility(readable, []));
    }

    return toSpeciesGmResponse(
      await this.speciesService.loadRecord(this.speciesService.db, readable.found),
    );
  }
}
