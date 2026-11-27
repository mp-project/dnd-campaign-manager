import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import { SpellLifecycleCommandSchema } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import type { RestoreSpellUseCase } from "#src/modules/spells/useCase/RestoreSpellUseCase";

export class RestoreSpellController extends AbstractController {
  constructor(private readonly useCase: RestoreSpellUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, spellId } = RequestSpellParamsSchema.parse(request.params);
      const command = SpellLifecycleCommandSchema.parse(request.body);

      return this.ok(
        await this.useCase.execute(request.requestContext, {
          campaignId: campaignId ?? null,
          spellId,
          command,
        }),
      );
    });
}
