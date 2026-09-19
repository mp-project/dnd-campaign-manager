import type { VerifyEmailVerificationDto } from "#src/modules/users/domain/dto/VerifyEmailVerificationDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class VerifyEmailVerificationUseCase {
  constructor(private readonly service: UsersService) {}

  async execute(input: VerifyEmailVerificationDto) {
    return this.service.verifyRegistrationEmail(input);
  }
}
