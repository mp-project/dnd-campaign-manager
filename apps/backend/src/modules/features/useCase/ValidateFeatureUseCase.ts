import type { RequestContext } from "#core/http/requestContext";
import type { ResponseFeatureValidationDto } from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

/**
 * Checks a stored definition against the current state: schemas, rules across parts, and whether
 * referenced assets still exist, fit the rulesets and form no cycle. Changes nothing, so a definition
 * that became invalid through changes elsewhere can be found before it is used.
 */
export class ValidateFeatureUseCase {
  constructor(private readonly featuresService: FeaturesService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; featureId: string },
  ): Promise<ResponseFeatureValidationDto> {
    const { db } = this.featuresService;

    await this.featuresService.assertCanWrite(context, input.campaignId, db);

    const found = await this.featuresService.requireForWrite(db, input);
    const issues = await this.featuresService.validateStored(db, found);

    return { featureId: found.feature.id, valid: issues.length === 0, issues };
  }
}
