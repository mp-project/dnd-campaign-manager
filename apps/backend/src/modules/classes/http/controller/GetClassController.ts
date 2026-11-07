import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { GetClassUseCase } from "#src/modules/classes/useCase/GetClassUseCase";

export class GetClassController extends AbstractController {
  constructor(private readonly useCase: GetClassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(request.requestContext, RequestClassParamsSchema.parse(request.params)),
    );
}
