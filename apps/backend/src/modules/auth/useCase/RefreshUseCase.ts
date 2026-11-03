import { toAuthResponse } from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type {
  AuthenticatedResult,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";

export class RefreshUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    refreshToken: string | null,
    metadata: ClientMetadata,
  ): Promise<AuthenticatedResult> {
    if (!refreshToken) {
      throw new AuthError("SESSION_INVALID", "Session is invalid");
    }

    const session = await this.authService.sessionService.refresh(refreshToken, metadata);

    return { session, response: toAuthResponse(session) };
  }
}
