import type { OAuthProvider } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type {
  ClientMetadata,
  CompleteOAuthCallbackResult,
} from "#src/modules/auth/service/AuthService.contracts";

export class OAuthCallbackUseCase {
  constructor(private readonly authService: AuthService) {}

  execute(input: {
    provider: OAuthProvider;
    code: string;
    state: string;
    stateCookieValue: string | null;
    metadata: ClientMetadata;
  }): Promise<CompleteOAuthCallbackResult> {
    return this.authService.oauthService.completeOAuthCallback(input);
  }
}
