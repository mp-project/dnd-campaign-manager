import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";

import { UpdateMeSchema } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UsersService } from "#src/modules/users/service/UsersService";
import { UpdateMeUseCase } from "#src/modules/users/useCase/UpdateMeUseCase";
import { toMeResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class UpdateMeController extends AbstractController {
  constructor(
    private readonly updateMeUseCase: UpdateMeUseCase,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = UpdateMeSchema.parse(request.body);
      const aggregate = await this.updateMeUseCase.execute(request.requestContext, body);

      return toMeResponse(
        aggregate,
        this.usersService.listEffectiveGlobalPermissions(request.requestContext),
      );
    });
}
