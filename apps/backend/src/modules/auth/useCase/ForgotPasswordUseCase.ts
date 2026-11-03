import type { ForgotPasswordDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { AcceptedResponseDto } from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class ForgotPasswordUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    input: ForgotPasswordDto,
    metadata: ClientMetadata,
  ): Promise<AcceptedResponseDto> {
    await this.authService.passwordService.requestPasswordReset(input, metadata);

    return { status: "accepted" };
  }
}
