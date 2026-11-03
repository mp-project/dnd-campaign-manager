import type { RequestContext } from "#core/http/requestContext";
import type { ChangePasswordDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

export class ChangePasswordUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(context: RequestContext, input: ChangePasswordDto): Promise<void> {
    await this.authService.passwordService.changePassword(context, input);
  }
}
