import { NotFoundError, UnauthenticatedError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { UserRow } from "#src/modules/users/domain/repository/UsersRepository";
import type { GetOneUserByUseCase } from "#src/modules/users/useCase/GetOneUserByUseCase";

export class CampaignUserService {
  constructor(private readonly getOneUserByUseCase: GetOneUserByUseCase) {}

  async requireUser(context: RequestContext): Promise<UserRow> {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    const user = await this.getOneUserByUseCase.execute({ userId: context.actorId });

    if (!user) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    return user;
  }

  async resolveAccessibleUserId(
    context: RequestContext,
    requestedUserId?: string,
  ): Promise<string> {
    const actor = await this.requireUser(context);
    const targetUserId = requestedUserId ?? actor.id;

    if (requestedUserId) {
      await this.requireRequestedUser(requestedUserId);
    }

    if (targetUserId !== actor.id && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Campaign not found");
    }

    return targetUserId;
  }

  private async requireRequestedUser(userId: string): Promise<UserRow> {
    const user = await this.getOneUserByUseCase.execute({ userId });

    if (!user) {
      throw new NotFoundError("Campaign not found");
    }

    return user;
  }
}