import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseTrustedDeviceListDto,
  toTrustedDeviceListResponse,
} from "#src/modules/auth/domain/dto/ResponseTrustedDeviceDto";
import { AuthService } from "#src/modules/auth/service/AuthService";

/** The own trusted devices; the asking browser is marked as current. */
export class ListTrustedDevicesUseCase {
  constructor(private readonly authService: AuthService) {}

  async execute(context: RequestContext, currentToken: string | null): Promise<ResponseTrustedDeviceListDto> {
    const actorId = this.authService.assertAuthenticated(context);
    const devices = await this.authService.deviceService.list(actorId, currentToken);

    return toTrustedDeviceListResponse(devices);
  }
}
