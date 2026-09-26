import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";

import { GetMyInvitationsUseCase } from "#src/modules/users/useCase/GetMyInvitationsUseCase";

export class GetMyInvitationsController extends AbstractController {
  constructor(private readonly getMyInvitationsUseCase: GetMyInvitationsUseCase) {
    super();
  }

  handle = async (request: { requestContext: RequestContext }) =>
    this.execute(async () => {
      const data = await this.getMyInvitationsUseCase.execute(request.requestContext);

      return { data };
    });
}
