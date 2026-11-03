import { AuthService } from "#src/modules/auth/service/AuthService";
import type {
  AuthSession,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";

/**
 * Verifies the email from the link and signs the user in right away.
 */
export class VerifyRegistrationEmailByLinkUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    token: string,
    metadata: ClientMetadata,
  ): Promise<{ session: AuthSession; redirectPath: string }> {
    const { registrationService, repository, sessionService, transactionManager } =
      this.authService;
    const result = await registrationService.verifyRegistrationEmailByToken(token);

    return transactionManager.inTransaction(async (tx) => {
      sessionService.assertUserCanAuthenticate(result.user);

      await repository.updateLastLogin(tx, {
        userId: result.user.id,
        at: new Date(),
        actorId: result.user.id,
      });

      const issuedSession = await sessionService.issueSession(tx, result.user, metadata);

      return {
        session: issuedSession.session,
        redirectPath: result.redirectPath,
      };
    });
  }
}
