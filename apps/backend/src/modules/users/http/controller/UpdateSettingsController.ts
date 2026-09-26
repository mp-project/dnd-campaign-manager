import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";

import { UpdateSettingsSchema } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import { UsersService } from "#src/modules/users/service/UsersService";
import { UpdateSettingsUseCase } from "#src/modules/users/useCase/UpdateSettingsUseCase";
import { toMeResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class UpdateSettingsController extends AbstractController {
  constructor(
    private readonly updateSettingsUseCase: UpdateSettingsUseCase,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = UpdateSettingsSchema.parse(request.body);
      const aggregate = await this.updateSettingsUseCase.execute(
        request.requestContext,
        body,
      );

      return toMeResponse(
        aggregate,
        this.usersService.listEffectiveGlobalPermissions(request.requestContext),
      );
    });
}
