import { UsersService } from "#src/modules/users/service/UsersService";

export class RequestEmailVerificationUseCase {
  constructor(private readonly service: UsersService) {}

  async execute(email: string) {
    return this.service.requestRegistrationVerification(email);
  }
}
