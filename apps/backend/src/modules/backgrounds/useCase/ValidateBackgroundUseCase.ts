import type { RequestContext } from "#core/http/requestContext";
import type { ResponseBackgroundValidationDto } from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

/**
 * Checks a stored definition against the current state: schemas, rules across parts, the code per
 * ruleset, the edition rules, referenced assets and what they are, and feature bindings. Changes
 * nothing, so a definition that became invalid through changes elsewhere can be found first.
 */
export class ValidateBackgroundUseCase {
  constructor(private readonly backgroundsService: BackgroundsService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; backgroundId: string },
  ): Promise<ResponseBackgroundValidationDto> {
    const { db } = this.backgroundsService;

    await this.backgroundsService.assertCanWrite(context, input.campaignId, db);

    const found = await this.backgroundsService.requireForWrite(db, input);
    const issues = await this.backgroundsService.validateStored(db, found);

    return { backgroundId: found.background.id, valid: issues.length === 0, issues };
  }
}
