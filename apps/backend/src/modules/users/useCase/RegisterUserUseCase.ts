import type { RegisterDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class RegisterUserUseCase {
  constructor(private readonly service: AuthService) {}

  async execute(input: RegisterDto, metadata: ClientMetadata) {
    return this.service.register(input, metadata);
  }
}
