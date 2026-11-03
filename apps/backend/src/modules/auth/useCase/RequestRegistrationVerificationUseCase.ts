import {
  type ResponseEmailVerificationDto,
  toEmailVerificationResponse,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class RequestRegistrationVerificationUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    email: string,
    metadata: ClientMetadata,
  ): Promise<ResponseEmailVerificationDto> {
    const verification = await this.authService.registrationService.requestRegistrationVerification(
      email,
      metadata,
    );

    return toEmailVerificationResponse(verification);
  }
}
