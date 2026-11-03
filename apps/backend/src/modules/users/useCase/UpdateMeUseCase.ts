import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
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

      const patch = {
        ...input,
        email:
          input.email !== undefined ? this.usersService.normalizeEmail(input.email) : undefined,
      };

      if (patch.email && patch.email !== current.email) {
        const taken = await repository.isActiveEmailTaken(tx, patch.email, actorId);

        if (taken) {
          throw new ConflictError("Email is already in use");
        }
      }

      const updated = await repository.updateProfile(tx, {
        userId: actorId,
        actorId,
        patch,
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

    return toMeResponse(aggregate, this.usersService.listEffectiveGlobalPermissions(context));
  }
}
