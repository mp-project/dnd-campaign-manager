import {
  type ResponseEmailVerificationDto,
  toEmailVerificationResponse,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class GetRegistrationVerificationStatusUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(verificationId: string): Promise<ResponseEmailVerificationDto> {
    const verification =
      await this.authService.registrationService.getRegistrationVerificationStatus(verificationId);

    return toEmailVerificationResponse(verification);
  }
}
