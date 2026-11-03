import type { ResetPasswordDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";
import type { TrustedDeviceToken } from "#src/modules/auth/service/AuthTrustedDeviceService";

export class ResetPasswordUseCase {
  constructor(private readonly authService: AuthService) {}

  execute(
    input: ResetPasswordDto,
    metadata: ClientMetadata,
  ): Promise<TrustedDeviceToken | null> {
    return this.authService.passwordService.confirmPasswordReset(input, metadata);
  }
}
