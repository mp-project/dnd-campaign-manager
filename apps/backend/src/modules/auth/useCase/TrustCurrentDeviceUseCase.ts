import type { RequestContext } from "#core/http/requestContext";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";
import type { TrustedDeviceToken } from "#src/modules/auth/service/AuthTrustedDeviceService";

export class TrustCurrentDeviceUseCase {
  constructor(private readonly authService: AuthService) {}

  execute(
    context: RequestContext,
    metadata: ClientMetadata,
    currentToken: string | null,
  ): Promise<TrustedDeviceToken> {
    const actorId = this.authService.assertAuthenticated(context);

    return this.authService.deviceService.trust(actorId, metadata, currentToken);
  }
}
