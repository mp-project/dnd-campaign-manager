import type { RequestContext } from "#core/http/requestContext";
import {
  type RequestEmailChangeDto,
  type ResponseEmailChangeRequestDto,
  toEmailChangeRequestResponse,
} from "#src/modules/auth/domain/dto/EmailChangeDto";
import { AuthService } from "#src/modules/auth/service/AuthService";
import type { ClientMetadata } from "#src/modules/auth/service/AuthService.contracts";

export class RequestEmailChangeUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(
    context: RequestContext,
    input: RequestEmailChangeDto,
    metadata: ClientMetadata,
  ): Promise<ResponseEmailChangeRequestDto> {
    const result = await this.authService.emailChangeService.requestEmailChange(
      context,
      input,
      metadata,
    );

    return toEmailChangeRequestResponse(result);
  }
}
