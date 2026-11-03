import { VerifyEmailVerificationSchema } from "#src/modules/users/domain/dto/VerifyEmailVerificationDto";
import { VerifyEmailVerificationUseCase } from "#src/modules/users/useCase/VerifyEmailVerificationUseCase";
import { toRegisterUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";
import { AbstractController } from "#core/http/controller/AbstractController";

export class VerifyEmailVerificationController extends AbstractController {
  constructor(
    private readonly verifyEmailVerificationUseCase: VerifyEmailVerificationUseCase,
  ) {
    super();
  }

  handle = async (request: {
    body: unknown;
    ip: string;
    headers: { "user-agent"?: string | undefined };
  }) =>
    this.execute(async () => {
      const body = VerifyEmailVerificationSchema.parse(request.body);
      const user = await this.verifyEmailVerificationUseCase.execute(body, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });

      return toRegisterUserResponse({
        user,
        verificationId: body.verificationId,
        verificationCode: null,
      });
    });
}
