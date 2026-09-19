import type { RequestContext } from "#core/http/requestContext";
import type { AdminUserListFilter } from "#src/modules/users/domain/repository/UsersRepository";
import { UsersService } from "#src/modules/users/service/UsersService";

export class AdminListUsersUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(context: RequestContext, filter: AdminUserListFilter) {
    return this.usersService.adminList(context, filter);
  }
}
