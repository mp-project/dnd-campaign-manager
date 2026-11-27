import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesCatalogInput, SpeciesReader } from "#src/modules/species/useCase/SpeciesReader";

/**
 * Where a species is used in the current campaign: links and definitions that refer to it, such as
 * its variants. Players only see usages whose other end they may see as well. `ownOnly` limits it
 * to custom species, for the route under `/species`; the catalog route also answers for global
 * ones.
 */
export class GetSpeciesUsagesUseCase {
  constructor(
    private readonly reader: SpeciesReader,
    private readonly speciesService: SpeciesService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: SpeciesCatalogInput,
  ): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);
    if (!readable.access) {
      throw new NotFoundError("Species not found");
    }

    return this.speciesService.getUsages(readable.access, readable.found.asset.id);
  }
}
