import type { VerifyEmailVerificationDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class VerifyEmailVerificationUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(input: VerifyEmailVerificationDto) {
    return this.service.verifyRegistrationEmail(input);
  }
}
