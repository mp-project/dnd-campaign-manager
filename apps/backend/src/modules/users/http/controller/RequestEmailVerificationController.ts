import { RequestEmailVerificationSchema } from "#src/modules/users/domain/dto/RequestEmailVerificationDto";
import { RequestEmailVerificationUseCase } from "#src/modules/users/useCase/RequestEmailVerificationUseCase";
import { toEmailVerificationResponse } from "#src/modules/users/http/controller/UserResponseMapper";
import { AbstractController } from "#core/http/controller/AbstractController";

export class RequestEmailVerificationController extends AbstractController {
  constructor(
    private readonly requestEmailVerificationUseCase: RequestEmailVerificationUseCase,
  ) {
    super();
  }

  handle = async (request: { body: unknown }) =>
    this.execute(async () => {
      const body = RequestEmailVerificationSchema.parse(request.body);
      const verification = await this.requestEmailVerificationUseCase.execute(body.email);

      return toEmailVerificationResponse(verification);
    });
}
