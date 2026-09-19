import type { RequestContext } from "#core/http/requestContext";

import { GetMyInvitationsUseCase } from "#src/modules/users/useCase/GetMyInvitationsUseCase";

export class GetMyInvitationsController {
  constructor(private readonly getMyInvitationsUseCase: GetMyInvitationsUseCase) {}

  handle = async (request: { requestContext: RequestContext }) => {
    const data = await this.getMyInvitationsUseCase.execute(request.requestContext);

    return { data };
  };
}
