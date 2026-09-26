import { AuthService } from "#src/modules/auth/service/AuthService";

export class RequestEmailVerificationUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(email: string) {
    return this.service.requestRegistrationVerification(email);
  }
}
