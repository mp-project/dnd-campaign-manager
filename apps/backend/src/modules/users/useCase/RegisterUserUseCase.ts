import type { RegisterDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class RegisterUserUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(input: RegisterDto) {
    return this.service.register(input);
  }
}
