import { RequestEmailVerificationStatusParamsSchema } from "#src/modules/users/domain/dto/RequestEmailVerificationDto";
import { GetEmailVerificationStatusUseCase } from "#src/modules/users/useCase/GetEmailVerificationStatusUseCase";
import { toEmailVerificationResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class GetEmailVerificationStatusController {
  constructor(
    private readonly getEmailVerificationStatusUseCase: GetEmailVerificationStatusUseCase,
  ) {}

  handle = async (request: { params: unknown }) => {
    const params = RequestEmailVerificationStatusParamsSchema.parse(request.params);
    const verification = await this.getEmailVerificationStatusUseCase.execute(
      params.verificationId,
    );

    return toEmailVerificationResponse(verification);
  };
}
