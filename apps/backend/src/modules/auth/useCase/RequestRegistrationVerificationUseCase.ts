import type { AcceptedResponseDto } from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

/**
 * Always answers "accepted", also for unknown or verified addresses.
 */
export class RequestRegistrationVerificationUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(email: string, metadata: ClientMetadata): Promise<AcceptedResponseDto> {
    await this.authService.registrationService.requestRegistrationVerification(email, metadata);

    return { status: "accepted" };
  }
}
