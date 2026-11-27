import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellListParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import { UpdateSpellListSchema } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import type { UpdateSpellListUseCase } from "#src/modules/spells/useCase/UpdateSpellListUseCase";

export class UpdateSpellListController extends AbstractController {
  constructor(private readonly useCase: UpdateSpellListUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, spellListId } = RequestSpellListParamsSchema.parse(request.params);
      const command = UpdateSpellListSchema.parse(request.body);

      return this.ok(
        await this.useCase.execute(request.requestContext, {
          campaignId: campaignId ?? null,
          spellListId,
          command,
        }),
      );
    });
}
