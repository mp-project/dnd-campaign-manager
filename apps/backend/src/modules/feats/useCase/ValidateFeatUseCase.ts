import type { RequestContext } from "#core/http/requestContext";
import type { ResponseFeatValidationDto } from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

/**
 * Checks a stored definition against the current state: schemas, rules across parts, the code per
 * ruleset, the category, referenced assets, feature bindings and prerequisite cycles. Changes
 * nothing, so a definition that became invalid through changes elsewhere can be found first.
 */
export class ValidateFeatUseCase {
  constructor(private readonly featsService: FeatsService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; featId: string },
  ): Promise<ResponseFeatValidationDto> {
    const { db } = this.featsService;

    await this.featsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.featsService.requireForWrite(db, input);
    const issues = await this.featsService.validateStored(db, found);

    return { featId: found.feat.id, valid: issues.length === 0, issues };
  }
}
