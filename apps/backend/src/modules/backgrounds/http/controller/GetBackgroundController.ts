import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { GetBackgroundUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundUseCase";

export class GetBackgroundController extends AbstractController {
  constructor(private readonly useCase: GetBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(request.requestContext, RequestBackgroundParamsSchema.parse(request.params)),
    );
}
