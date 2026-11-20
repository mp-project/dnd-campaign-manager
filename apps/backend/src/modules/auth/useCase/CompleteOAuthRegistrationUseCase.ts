import { recordChange } from "#core/log/auditLog";
import type { OAuthCompleteRegistrationDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { toAuthResponse } from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type {
  AuthenticatedResult,
  ClientMetadata,
} from "#src/modules/auth/service/AuthService.contracts";

export class CompleteOAuthRegistrationUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    input: OAuthCompleteRegistrationDto,
    onboardingCookieValue: string | null,
    metadata: ClientMetadata,
  ): Promise<AuthenticatedResult> {
    const session = await this.authService.oauthService.completeOAuthRegistration(
      input,
      onboardingCookieValue,
      metadata,
    );

    recordChange({
      action: "auth.completeOAuthRegistration",
      entities: [{ entityType: "user", entityId: session.user.id }],
      actorId: session.user.id,
      public: "registration",
    });

    return { session, response: toAuthResponse(session) };
  }
}
