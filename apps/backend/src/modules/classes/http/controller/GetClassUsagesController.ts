import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { GetClassUsagesUseCase } from "#src/modules/classes/useCase/GetClassUsagesUseCase";

export class GetClassUsagesController extends AbstractController {
  constructor(private readonly useCase: GetClassUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCampaignClassParamsSchema.parse(request.params),
      ),
    );
}
