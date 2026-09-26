import { AuthService } from "#src/modules/auth/service/AuthService";

export class GetEmailVerificationStatusUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(verificationId: string) {
    return this.service.getRegistrationVerificationStatus(verificationId);
  }
}
