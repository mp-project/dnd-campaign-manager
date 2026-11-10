import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { GetSubclassSectionUseCase } from "#src/modules/subclasses/useCase/GetSubclassSectionUseCase";

export class GetSubclassSectionController extends AbstractController {
  constructor(private readonly useCase: GetSubclassSectionUseCase) {
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
