import type { RegisterDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  type ResponseRegisterUserDto,
  toRegisterUserResponse,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class RegisterUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    input: RegisterDto,
    metadata: ClientMetadata,
  ): Promise<ResponseRegisterUserDto> {
    const result = await this.authService.registrationService.register(input, metadata);

    return toRegisterUserResponse({
      user: result.user,
      verificationId: result.verificationRequest.id,
      verificationCode: result.verificationCode,
    });
  }
}
