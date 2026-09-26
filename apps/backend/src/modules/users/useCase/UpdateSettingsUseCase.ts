import type { RequestContext } from "#core/http/requestContext";
import type { UpdateSettingsDto } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class UpdateSettingsUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(context: RequestContext, input: UpdateSettingsDto) {
    return this.usersService.updateSettings(context, input);
  }
}
