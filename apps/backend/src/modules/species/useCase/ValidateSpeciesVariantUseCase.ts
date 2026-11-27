import type { RequestContext } from "#core/http/requestContext";
import type { ResponseValidationDto } from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";
import type { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";

/** Checks a stored variant against its species and the current state. Changes nothing. */
export class ValidateSpeciesVariantUseCase {
  constructor(
    private readonly speciesService: SpeciesService,
    private readonly variantsService: SpeciesVariantsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; speciesId: string; variantId: string },
  ): Promise<ResponseValidationDto> {
    const { db } = this.speciesService;

    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    const species = await this.speciesService.requireForWrite(db, input);
    const found = await this.variantsService.requireVariantOf(db, species.species.id, input.variantId);
    const issues = await this.speciesService.validateStoredVariant(db, found);

    return { id: found.variant.id, valid: issues.length === 0, issues };
  }
}
