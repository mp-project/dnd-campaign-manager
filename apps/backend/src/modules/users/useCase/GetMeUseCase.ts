import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseMeDto,
  toMeResponse,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class GetMeUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(context: RequestContext): Promise<ResponseMeDto> {
    const { db, repository } = this.usersService;
    const actorId = this.usersService.assertAuthenticated(context);
    const aggregate = await repository.findAggregate(db, actorId, actorId);

    if (!aggregate) {
      throw new NotFoundError("User not found");
    }

    return toMeResponse(aggregate, this.usersService.listEffectiveGlobalPermissions(context));
  }
}
