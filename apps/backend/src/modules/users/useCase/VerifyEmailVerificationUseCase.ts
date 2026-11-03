import type { VerifyEmailVerificationDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class VerifyEmailVerificationUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(input: VerifyEmailVerificationDto, metadata: ClientMetadata) {
    return this.service.verifyRegistrationEmail(input, metadata);
  }
}
