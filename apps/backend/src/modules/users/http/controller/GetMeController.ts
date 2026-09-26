import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { GetMeUseCase } from "#src/modules/users/useCase/GetMeUseCase";
import { UsersService } from "#src/modules/users/service/UsersService";
import { toMeResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class GetMeController extends AbstractController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  handle = async (request: { requestContext: RequestContext }) =>
    this.execute(async () => {
      const aggregate = await this.getMeUseCase.execute(request.requestContext);

      return toMeResponse(
        aggregate,
        this.usersService.listEffectiveGlobalPermissions(request.requestContext),
      );
    });
}
