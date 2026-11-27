import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { GetSpellUseCase } from "#src/modules/spells/useCase/GetSpellUseCase";

export class GetSpellController extends AbstractController {
  constructor(private readonly useCase: GetSpellUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestSpellParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
