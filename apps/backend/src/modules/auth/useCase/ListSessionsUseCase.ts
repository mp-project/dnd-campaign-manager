import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSessionListDto,
  toSessionListResponse,
} from "#src/modules/auth/domain/dto/ResponseSessionDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

/** The own sessions; the one of the asking browser is marked as current. */
export class ListSessionsUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(context: RequestContext, currentRefreshToken: string | null): Promise<ResponseSessionListDto> {
    const actorId = this.authService.assertAuthenticated(context);
    const sessions = await this.authService.sessionService.listSessions(actorId, currentRefreshToken);

    return toSessionListResponse(sessions);
  }
}
