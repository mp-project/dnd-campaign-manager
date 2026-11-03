import type { RequestContext } from "#core/http/requestContext";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import type { RequestUsersDto } from "#src/modules/users/domain/dto/RequestUsersDto";
import {
  type ResponseReadableUserListDto,
  toReadableUserListResponse,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import { UsersService } from "#src/modules/users/service/UsersService";

/**
 * System admins get the full view of every user; everyone else the reduced view of USER accounts.
 */
export class ListUsersUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(
    context: RequestContext,
    filter: RequestUsersDto["listQuery"],
  ): Promise<ResponseReadableUserListDto> {
    const { db, repository } = this.usersService;
    this.usersService.assertAuthenticated(context);

    const canReadFull = this.usersService.canReadAllUsers(context);
    const visibleFilter = canReadFull ? filter : { ...filter, systemRole: SYSTEM_ROLE.USER };

    const [items, total] = await Promise.all([
      repository.list(db, visibleFilter),
      repository.count(db, visibleFilter),
    ]);

    return toReadableUserListResponse(items, canReadFull, filter.limit, total);
  }
}
