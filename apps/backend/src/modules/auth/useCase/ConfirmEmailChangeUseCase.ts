import type { RequestContext } from "#core/http/requestContext";
import { recordChange } from "#core/log/auditLog";
import type { ConfirmEmailChangeDto } from "#src/modules/auth/domain/dto/EmailChangeDto";
import {
  type AuthUserProfileDto,
  toAuthUserProfile,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class ConfirmEmailChangeUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    context: RequestContext,
    input: ConfirmEmailChangeDto,
    metadata: ClientMetadata,
  ): Promise<AuthUserProfileDto> {
    const user = await this.authService.emailChangeService.confirmEmailChange(
      context,
      input,
      metadata,
    );

    recordChange({
      action: "auth.confirmEmailChange",
      entities: [{ entityType: "user", entityId: user.id, fields: ["email"] }],
      actorId: user.id,
      security: true,
    });

    return toAuthUserProfile(user);
  }
}
