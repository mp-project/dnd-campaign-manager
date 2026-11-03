import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUserDto,
  toUserResponse,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import type { UpdateUserDto } from "#src/modules/users/domain/dto/UpdateUserDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class UpdateUserUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(
    context: RequestContext,
    userId: string,
    input: UpdateUserDto,
  ): Promise<ResponseUserDto> {
    const updated = await this.usersService.applyUserUpdate(context, userId, input);

    return toUserResponse(updated);
  }
}
