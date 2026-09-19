import type { RequestContext } from "#core/http/requestContext";
import type { UpdateMeDto } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class UpdateMeUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(context: RequestContext, input: UpdateMeDto) {
    return this.usersService.updateMe(context, input);
  }
}
