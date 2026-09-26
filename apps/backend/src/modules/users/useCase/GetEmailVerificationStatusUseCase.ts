import { UsersService } from "#src/modules/users/service/UsersService";

export class GetEmailVerificationStatusUseCase {
  constructor(private readonly service: UsersService) {}

  async execute(verificationId: string) {
    return this.service.getRegistrationVerificationStatus(verificationId);
  }
}
