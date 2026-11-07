import type { RegisterDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { AcceptedResponseDto } from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

/**
 * Always answers "accepted": whether the address was free only shows in the mailbox.
 */
export class RegisterUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(input: RegisterDto, metadata: ClientMetadata): Promise<AcceptedResponseDto> {
    await this.authService.registrationService.register(input, metadata);

    return { status: "accepted" };
  }
}
