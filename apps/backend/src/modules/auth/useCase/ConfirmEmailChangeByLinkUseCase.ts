import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

/**
 * Confirms the new address from the emailed link. Unlike the registration link it signs nobody
 * in: the link only proves the mailbox, not the account.
 */
export class ConfirmEmailChangeByLinkUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(token: string, metadata: ClientMetadata): Promise<{ redirectPath: string }> {
    await this.authService.emailChangeService.confirmEmailChangeByToken(token, metadata);

    return { redirectPath: "/" };
  }
}
