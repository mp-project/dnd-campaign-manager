import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSpellParamsSchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { GetSpellUsagesUseCase } from "#src/modules/spells/useCase/GetSpellUsagesUseCase";

export class GetSpellUsagesController extends AbstractController {
  constructor(private readonly useCase: GetSpellUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignSpellParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
