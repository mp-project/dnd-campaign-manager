import type { RequestContext } from "#core/http/requestContext";
import type { ResponseClassValidationDto } from "#src/modules/classes/domain/dto/ResponseClassDto";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

/**
 * Checks a stored definition against the current state: schemas, rules across parts, the code per
 * ruleset, referenced assets and feature bindings. Changes nothing, so a definition that became
 * invalid through changes elsewhere can be found before it is used.
 */
export class ValidateClassUseCase {
  constructor(private readonly classesService: ClassesService) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; classId: string },
  ): Promise<ResponseClassValidationDto> {
    const { db } = this.classesService;

    await this.classesService.assertCanWrite(context, input.campaignId, db);

    const found = await this.classesService.requireForWrite(db, input);
    const issues = await this.classesService.validateStored(db, found);

    return { classId: found.characterClass.id, valid: issues.length === 0, issues };
  }
}
