import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import {
  type ResponseMeDto,
  toMeResponse,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import type { UpdateMeDto } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class UpdateMeUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(context: RequestContext, input: UpdateMeDto): Promise<ResponseMeDto> {
    const { repository, transactionManager } = this.usersService;
    const actorId = this.usersService.assertAuthenticated(context);

    const aggregate = await transactionManager.inTransaction(async (tx) => {
      const current = await repository.findById(tx, actorId);

      if (!current) {
        throw new NotFoundError("User not found");
      }

      const updated = await repository.updateProfile(tx, {
        userId: actorId,
        actorId,
        patch: input,
      });

      if (!updated) {
        throw new NotFoundError("User not found");
      }

      const result = await repository.findAggregate(tx, updated.id, actorId);

      if (!result) {
        throw new NotFoundError("User not found");
      }

      return result;
    });

    // The own profile has no history (only changes by administrators do). The display name is an
    // `account` field of the tracked user, so like there only its name is logged, not its value.
    recordChange({
      action: "users.updateMe",
      entities: [{ entityType: "user", entityId: actorId, fields: Object.keys(input) }],
      actorId,
    });

    return toMeResponse(aggregate, this.usersService.listEffectiveGlobalPermissions(context));
  }
}
