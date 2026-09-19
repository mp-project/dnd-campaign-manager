import type { RegisterUserDto } from "#src/modules/users/domain/dto/RegisterUserDto";
import { UsersService } from "#src/modules/users/service/UsersService";

export class RegisterUserUseCase {
  constructor(private readonly service: UsersService) {}

  async execute(input: RegisterUserDto) {
    return this.service.register(input);
  }
}
