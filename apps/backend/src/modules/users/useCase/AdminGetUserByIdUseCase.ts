import type { RequestContext } from "#core/http/requestContext";
import { UsersService } from "#src/modules/users/service/UsersService";

export class AdminGetUserByIdUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(context: RequestContext, userId: string) {
    return this.usersService.adminGetById(context, userId);
  }
}
