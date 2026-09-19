import type { RequestContext } from "#core/http/requestContext";

import { UpdateSettingsSchema } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import { UsersService } from "#src/modules/users/service/UsersService";
import { UpdateSettingsUseCase } from "#src/modules/users/useCase/UpdateSettingsUseCase";
import { toMeResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class UpdateSettingsController {
  constructor(
    private readonly updateSettingsUseCase: UpdateSettingsUseCase,
    private readonly usersService: UsersService,
  ) {}

  handle = async (request: { body: unknown; requestContext: RequestContext }) => {
    const body = UpdateSettingsSchema.parse(request.body);
    const aggregate = await this.updateSettingsUseCase.execute(
      request.requestContext,
      body,
    );

    return toMeResponse(
      aggregate,
      this.usersService.listEffectiveGlobalPermissions(request.requestContext),
    );
  };
}
