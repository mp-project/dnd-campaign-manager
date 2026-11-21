import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class RemoveCurrentDeviceUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(context: RequestContext, token: string | null): Promise<void> {
    if (!token) {
      return;
    }

    const actorId = this.authService.assertAuthenticated(context);

    await this.authService.deviceService.remove(actorId, token);

    recordChange({
      action: "auth.removeCurrentDevice",
      entities: [{ entityType: "trustedDevice", entityId: actorId }],
      actorId,
      security: true,
    });
  }
}
