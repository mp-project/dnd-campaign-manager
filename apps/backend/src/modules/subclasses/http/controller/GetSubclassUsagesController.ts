import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { GetSubclassUsagesUseCase } from "#src/modules/subclasses/useCase/GetSubclassUsagesUseCase";

export class GetSubclassUsagesController extends AbstractController {
  constructor(private readonly useCase: GetSubclassUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCampaignSubclassParamsSchema.parse(request.params),
      ),
    );
}
