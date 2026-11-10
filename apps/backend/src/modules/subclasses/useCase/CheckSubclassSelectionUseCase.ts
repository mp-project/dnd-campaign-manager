import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestSubclassSelectionCheckDto } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { ResponseSubclassSelectionCheckDto } from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

/**
 * Whether a class assignment may take the subclass (see `SubclassesService.validateSelection`).
 * Answers 200 with the issues; stores nothing.
 */
export class CheckSubclassSelectionUseCase {
  constructor(
    private readonly subclassesService: SubclassesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; subclassId: string; command: RequestSubclassSelectionCheckDto },
  ): Promise<ResponseSubclassSelectionCheckDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const result = await this.subclassesService.validateSelection(access, {
      subclassId: input.subclassId,
      ...input.command,
    });

    return {
      subclassId: result.found.subclass.id,
      classId: result.found.subclass.classId,
      selectionLevel: result.found.base.selectionLevel,
      valid: result.valid,
      issues: result.issues,
      grantKeys: result.grantKeys,
    };
  }
}
