import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class LogoutAllUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(context: RequestContext): Promise<void> {
    const actorId = this.authService.assertAuthenticated(context);

    await this.authService.sessionService.logoutAll(actorId);

    recordChange({
      action: "auth.logoutAll",
      entities: [{ entityType: "user", entityId: actorId, fields: ["sessionVersion"] }],
      actorId,
      security: true,
    });
  }
}
