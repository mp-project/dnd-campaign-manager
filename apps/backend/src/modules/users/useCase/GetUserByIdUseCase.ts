import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseReadableUserDto,
  toReadableUserResponse,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import { UsersService } from "#src/modules/users/service/UsersService";

/**
 * System admins get the full view; everyone else the reduced view and a 404 for elevated accounts.
 */
export class GetUserByIdUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(context: RequestContext, userId: string): Promise<ResponseReadableUserDto> {
    const { db, repository } = this.usersService;
    this.usersService.assertAuthenticated(context);

    const user = await repository.findById(db, userId);

    if (!user || !this.usersService.isVisibleToActor(context, user)) {
      throw new NotFoundError("User not found");
    }

    return toReadableUserResponse(user, this.usersService.canReadAllUsers(context));
  }
}
