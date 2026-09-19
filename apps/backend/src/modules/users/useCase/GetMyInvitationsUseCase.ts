import type { RequestContext } from "#core/http/requestContext";
import { UsersService } from "#src/modules/users/service/UsersService";

export class GetMyInvitationsUseCase {
  constructor(private readonly usersService: UsersService) {}

  execute(context: RequestContext) {
    return this.usersService.getInvitations(context);
  }
}
