import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpellListParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { GetSpellListUseCase } from "#src/modules/spells/useCase/GetSpellListUseCase";

export class GetSpellListController extends AbstractController {
  constructor(private readonly useCase: GetSpellListUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestSpellListParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
