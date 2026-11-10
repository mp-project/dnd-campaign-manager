import type { RequestContext } from "#core/http/requestContext";
import type { ResponseSubclassValidationDto } from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

/**
 * Checks a stored definition against the current state: schemas, rules across parts, the class
 * and the rules against it, referenced assets and feature bindings. Changes nothing, so a
 * definition that became invalid through changes elsewhere can be found before it is used.
 */
export class ValidateSubclassUseCase {
  constructor(private readonly subclassesService: SubclassesService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; subclassId: string },
  ): Promise<ResponseSubclassValidationDto> {
    const { db } = this.subclassesService;

    await this.subclassesService.assertCanWrite(context, input.campaignId, db);

    const found = await this.subclassesService.requireForWrite(db, input);
    const issues = await this.subclassesService.validateStored(db, found);

    return { subclassId: found.subclass.id, valid: issues.length === 0, issues };
  }
}
