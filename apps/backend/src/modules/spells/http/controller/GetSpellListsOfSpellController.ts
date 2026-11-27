import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSpellParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { GetSpellListsOfSpellUseCase } from "#src/modules/spells/useCase/GetSpellListsOfSpellUseCase";

export class GetSpellListsOfSpellController extends AbstractController {
  constructor(private readonly useCase: GetSpellListsOfSpellUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignSpellParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
