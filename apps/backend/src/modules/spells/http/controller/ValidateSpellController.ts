import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ValidateSpellUseCase } from "#src/modules/spells/useCase/ValidateSpellUseCase";

export class ValidateSpellController extends AbstractController {
  constructor(private readonly useCase: ValidateSpellUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, spellId } = RequestSpellParamsSchema.parse(request.params);

      return this.ok(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, spellId }),
      );
    });
}
