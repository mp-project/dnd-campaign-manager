import type { LoginDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { toAuthResponse } from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type {
  AuthenticatedResult,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";
import type { TrustedDeviceToken } from "#src/modules/auth/service/AuthTrustedDeviceService";

export class LoginUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    input: LoginDto,
    metadata: ClientMetadata,
    deviceToken: string | null,
  ): Promise<AuthenticatedResult & { trustedDevice: TrustedDeviceToken | null }> {
    const { deviceService, sessionService } = this.authService;
    const session = await sessionService.login(input, metadata, deviceToken);
    const trustedDevice = input.trustDevice
      ? await deviceService.trust(session.user.id, metadata, deviceToken)
      : null;

    return { session, trustedDevice, response: toAuthResponse(session) };
  }
}
