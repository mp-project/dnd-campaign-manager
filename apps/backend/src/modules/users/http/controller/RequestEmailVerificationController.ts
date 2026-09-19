import { RequestEmailVerificationSchema } from "#src/modules/users/domain/dto/RequestEmailVerificationDto";
import { RequestEmailVerificationUseCase } from "#src/modules/users/useCase/RequestEmailVerificationUseCase";
import { toEmailVerificationResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class RequestEmailVerificationController {
  constructor(
    private readonly requestEmailVerificationUseCase: RequestEmailVerificationUseCase,
  ) {}

  handle = async (request: { body: unknown }) => {
    const body = RequestEmailVerificationSchema.parse(request.body);
    const verification = await this.requestEmailVerificationUseCase.execute(body.email);

    return toEmailVerificationResponse(verification);
  };
}
