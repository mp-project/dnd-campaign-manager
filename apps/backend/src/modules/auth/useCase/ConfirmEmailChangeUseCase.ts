import type { RequestContext } from "#core/http/requestContext";
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

    return toAuthUserProfile(user);
  }
}
