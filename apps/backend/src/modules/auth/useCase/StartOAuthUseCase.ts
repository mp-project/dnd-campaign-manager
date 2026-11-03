import type {
  OAuthIntent,
  OAuthProvider,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { StartOAuthResult } from "#src/modules/auth/service/AuthService.contracts";

export class StartOAuthUseCase {
  constructor(private readonly authService: AuthService) {}

  execute(input: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    redirectPath: string;
  }): Promise<StartOAuthResult> {
    return this.authService.oauthService.startOAuth(input);
  }
}
