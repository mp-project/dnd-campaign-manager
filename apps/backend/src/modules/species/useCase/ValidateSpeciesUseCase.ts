import type { RequestContext } from "#core/http/requestContext";
import type { ResponseValidationDto } from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";

/**
 * Checks a stored species against the current state: schemas, rules across parts, the code per
 * ruleset, referenced features and bindings, the 2024 ability rule, whether its required groups
 * have enough active variants and whether its variants still fit. Changes nothing.
 */
export class ValidateSpeciesUseCase {
  constructor(private readonly speciesService: SpeciesService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; speciesId: string },
  ): Promise<ResponseValidationDto> {
    const { db } = this.speciesService;

    await this.speciesService.assertCanWrite(context, input.campaignId, db);

    const found = await this.speciesService.requireForWrite(db, input);
    const issues = await this.speciesService.validateStored(db, found);

    return { id: found.species.id, valid: issues.length === 0, issues };
  }
}
