import { VerifyEmailVerificationSchema } from "#src/modules/users/domain/dto/VerifyEmailVerificationDto";
import { VerifyEmailVerificationUseCase } from "#src/modules/users/useCase/VerifyEmailVerificationUseCase";
import { toRegisterUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class VerifyEmailVerificationController {
  constructor(
    private readonly verifyEmailVerificationUseCase: VerifyEmailVerificationUseCase,
  ) {}

  handle = async (request: { body: unknown }) => {
    const body = VerifyEmailVerificationSchema.parse(request.body);
    const user = await this.verifyEmailVerificationUseCase.execute(body);

    return toRegisterUserResponse({
      user,
      verificationId: body.verificationId,
      verificationCode: null,
    });
  };
}
