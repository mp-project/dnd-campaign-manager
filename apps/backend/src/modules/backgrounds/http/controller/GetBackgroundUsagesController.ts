import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { GetBackgroundUsagesUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundUsagesUseCase";

export class GetBackgroundUsagesController extends AbstractController {
  constructor(private readonly useCase: GetBackgroundUsagesUseCase) {
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
