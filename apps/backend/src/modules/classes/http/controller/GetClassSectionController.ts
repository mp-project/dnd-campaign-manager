import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { GetClassSectionUseCase } from "#src/modules/classes/useCase/GetClassSectionUseCase";

export class GetClassSectionController extends AbstractController {
  constructor(private readonly useCase: GetClassSectionUseCase) {
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
