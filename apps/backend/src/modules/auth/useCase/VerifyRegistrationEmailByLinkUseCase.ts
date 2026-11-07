import { ConflictError } from "#core/error/http/index";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

/**
 * Verifies the email from the link and sends the user to the sign-in page. It signs nobody in:
 * a link opened by somebody else (or by a mail scanner) must not create a session.
 */
export class VerifyRegistrationEmailByLinkUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(token: string, metadata: ClientMetadata): Promise<{ redirectPath: string }> {
    try {
      await this.authService.registrationService.verifyRegistrationEmailByToken(token, metadata);
    } catch (error) {
      if (error instanceof ConflictError) {
        return { redirectPath: "/login?verified=0" };
      }

      throw error;
    }

    return { redirectPath: "/login?verified=1" };
  }
}
