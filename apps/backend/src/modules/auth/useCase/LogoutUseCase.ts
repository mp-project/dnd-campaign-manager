import { AuthService } from "#src/modules/auth/service/AuthService";

export class LogoutUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(refreshToken: string | null): Promise<void> {
    await this.authService.sessionService.logoutCurrent(refreshToken);
  }
}
