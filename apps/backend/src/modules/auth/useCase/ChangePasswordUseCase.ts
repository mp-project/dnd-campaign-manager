import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import type { ChangePasswordDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class ChangePasswordUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(context: RequestContext, input: ChangePasswordDto): Promise<void> {
    await this.authService.passwordService.changePassword(context, input);

    const actorId = this.authService.assertAuthenticated(context);

    recordChange({
      action: "auth.changePassword",
      entities: [{ entityType: "user", entityId: actorId, fields: ["passwordHash"] }],
      actorId,
      security: true,
    });
  }
}
