import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class RequestEmailVerificationUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(email: string, metadata: ClientMetadata) {
    return this.service.requestRegistrationVerification(email, metadata);
  }
}
