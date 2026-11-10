import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { GetBackgroundSectionUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundSectionUseCase";

export class GetBackgroundSectionController extends AbstractController {
  constructor(private readonly useCase: GetBackgroundSectionUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCampaignBackgroundParamsSchema.parse(request.params),
      ),
    );
}
