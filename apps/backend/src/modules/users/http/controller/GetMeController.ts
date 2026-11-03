import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { GetMeUseCase } from "#src/modules/users/useCase/GetMeUseCase";

export class GetMeController extends AbstractController {
  constructor(private readonly getMeUseCase: GetMeUseCase) {
    super();
  }

  handle = async (request: { requestContext: RequestContext }) =>
    this.execute(async () => this.getMeUseCase.execute(request.requestContext));
}
