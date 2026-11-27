import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellListParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import { SpellLifecycleCommandSchema } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import type { DeleteSpellListUseCase } from "#src/modules/spells/useCase/DeleteSpellListUseCase";

export class DeleteSpellListController extends AbstractController {
  constructor(private readonly useCase: DeleteSpellListUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, spellListId } = RequestSpellListParamsSchema.parse(request.params);
      const command = SpellLifecycleCommandSchema.parse(request.query);

      return this.ok(
        await this.useCase.execute(request.requestContext, {
          campaignId: campaignId ?? null,
          spellListId,
          command,
        }),
      );
    });
}
