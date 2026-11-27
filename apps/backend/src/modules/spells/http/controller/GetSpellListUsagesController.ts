import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSpellListParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { GetSpellListUsagesUseCase } from "#src/modules/spells/useCase/GetSpellListUsagesUseCase";

export class GetSpellListUsagesController extends AbstractController {
  constructor(private readonly useCase: GetSpellListUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignSpellListParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
