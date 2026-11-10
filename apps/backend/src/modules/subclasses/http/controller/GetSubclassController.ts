import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { GetSubclassUseCase } from "#src/modules/subclasses/useCase/GetSubclassUseCase";

export class GetSubclassController extends AbstractController {
  constructor(private readonly useCase: GetSubclassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(request.requestContext, RequestSubclassParamsSchema.parse(request.params)),
    );
}
