import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateSpellSchema } from "#src/modules/spells/domain/dto/CreateSpellDto";
import { RequestScopeParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { CreateSpellUseCase } from "#src/modules/spells/useCase/CreateSpellUseCase";

export class CreateSpellController extends AbstractController {
  constructor(private readonly useCase: CreateSpellUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = RequestScopeParamsSchema.parse(request.params ?? {});
      const command = CreateSpellSchema.parse(request.body);

      return this.created(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, command }),
      );
    });
}
