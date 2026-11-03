import type { VerifyEmailVerificationDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  type ResponseRegisterUserDto,
  toRegisterUserResponse,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class VerifyRegistrationEmailUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    input: VerifyEmailVerificationDto,
    metadata: ClientMetadata,
  ): Promise<ResponseRegisterUserDto> {
    const user = await this.authService.registrationService.verifyRegistrationEmail(
      input,
      metadata,
    );

    return toRegisterUserResponse({
      user,
      verificationId: input.verificationId,
      verificationCode: null,
    });
  }
}
