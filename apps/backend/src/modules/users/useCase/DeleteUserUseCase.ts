import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { UsersService } from "#src/modules/users/service/UsersService";

/**
 * Disables the user (soft delete); the row stays with status DISABLED.
 */
export class DeleteUserUseCase {
  constructor(private readonly usersService: UsersService) {}

  async execute(context: RequestContext, userId: string): Promise<void> {
    const { db, repository } = this.usersService;
    this.usersService.assertAuthenticated(context);

    const current = await repository.findById(db, userId);

    if (!current) {
      throw new NotFoundError("User not found");
    }

    await this.usersService.applyUserUpdate(context, userId, {
      expectedVersion: current.version,
      status: "DISABLED",
    });
  }
}
