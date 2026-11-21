import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import { AuthService } from "#src/modules/auth/service/AuthService";

/** Ends one own session; another user's session is unknown (404) like one that already ended. */
export class RevokeSessionUseCase {
  constructor(private readonly authService: AuthService) {}

  /** Tells whether it was the asking browser's own session, which then has to drop its cookies. */
  async execute(
    context: RequestContext,
    sessionId: string,
    currentRefreshToken: string | null,
  ): Promise<{ current: boolean }> {
    const actorId = this.authService.assertAuthenticated(context);
    const revoked = await this.authService.sessionService.revokeSession(actorId, sessionId, currentRefreshToken);

    if (!revoked) {
      throw new NotFoundError("Session not found");
    }

    recordChange({
      action: "auth.revokeSession",
      entities: [{ entityType: "authSession", entityId: sessionId }],
      actorId,
      security: true,
    });

    return revoked;
  }
}
