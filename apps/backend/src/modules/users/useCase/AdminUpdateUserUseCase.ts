import type { RequestContext } from "#core/http/requestContext";
import type { AdminUpdateUserDto } from "#src/modules/users/domain/dto/AdminUpdateUserDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class AdminUpdateUserUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(context: RequestContext, userId: string, input: AdminUpdateUserDto) {
    return this.usersService.adminUpdate(context, userId, input);
  }
}
