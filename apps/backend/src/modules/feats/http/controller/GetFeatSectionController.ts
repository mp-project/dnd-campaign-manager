import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignFeatParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { GetFeatChoicesUseCase } from "#src/modules/feats/useCase/GetFeatChoicesUseCase";
import type { GetFeatFeaturesUseCase } from "#src/modules/feats/useCase/GetFeatFeaturesUseCase";
import type { GetFeatPrerequisitesUseCase } from "#src/modules/feats/useCase/GetFeatPrerequisitesUseCase";
import type { GetFeatUsagesUseCase } from "#src/modules/feats/useCase/GetFeatUsagesUseCase";

/** The read-only sections of the catalog detail. */
export class GetFeatSectionController extends AbstractController {
  constructor(
    private readonly useCase:
      | GetFeatPrerequisitesUseCase
      | GetFeatChoicesUseCase
      | GetFeatFeaturesUseCase
      | GetFeatUsagesUseCase,
  ) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
