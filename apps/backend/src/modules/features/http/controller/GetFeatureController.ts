import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatureParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { GetFeatureUseCase } from "#src/modules/features/useCase/GetFeatureUseCase";

export class GetFeatureController extends AbstractController {
  constructor(private readonly useCase: GetFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(request.requestContext, RequestFeatureParamsSchema.parse(request.params)),
    );
}
