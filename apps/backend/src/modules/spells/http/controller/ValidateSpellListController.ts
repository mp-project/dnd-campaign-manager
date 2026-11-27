import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellListParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ValidateSpellListUseCase } from "#src/modules/spells/useCase/ValidateSpellListUseCase";

export class ValidateSpellListController extends AbstractController {
  constructor(private readonly useCase: ValidateSpellListUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, spellListId } = RequestSpellListParamsSchema.parse(request.params);

      return this.ok(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, spellListId }),
      );
    });
}
