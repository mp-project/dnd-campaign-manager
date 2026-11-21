import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";
import type { TrustedDeviceToken } from "#src/modules/auth/service/AuthTrustedDeviceService";

export class TrustCurrentDeviceUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    context: RequestContext,
    metadata: ClientMetadata,
    currentToken: string | null,
  ): Promise<TrustedDeviceToken> {
    const actorId = this.authService.assertAuthenticated(context);

    const device = await this.authService.deviceService.trust(actorId, metadata, currentToken);

    recordChange({
      action: "auth.trustDevice",
      entities: [{ entityType: "trustedDevice", entityId: actorId }],
      actorId,
      security: true,
    });

    return device;
  }
}
