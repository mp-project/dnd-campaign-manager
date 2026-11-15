import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { AuthService } from "#src/modules/auth/service/AuthService";

/** Removes one own trusted device; another user's device is unknown (404). */
export class RemoveTrustedDeviceUseCase {
  constructor(private readonly authService: AuthService) {}

  /** Tells whether it was the asking browser, which then drops its device cookie. */
  async execute(context: RequestContext, deviceId: string, currentToken: string | null): Promise<{ current: boolean }> {
    const actorId = this.authService.assertAuthenticated(context);
    const removed = await this.authService.deviceService.removeById(actorId, deviceId, currentToken);

    if (!removed) {
      throw new NotFoundError("Trusted device not found");
    }

    return removed;
  }
}
