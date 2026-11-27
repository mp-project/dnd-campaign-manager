import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateSpellListSchema } from "#src/modules/spells/domain/dto/CreateSpellDto";
import { RequestScopeParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { CreateSpellListUseCase } from "#src/modules/spells/useCase/CreateSpellListUseCase";

export class CreateSpellListController extends AbstractController {
  constructor(private readonly useCase: CreateSpellListUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = RequestScopeParamsSchema.parse(request.params ?? {});
      const command = CreateSpellListSchema.parse(request.body);

      return this.created(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, command }),
      );
    });
}
