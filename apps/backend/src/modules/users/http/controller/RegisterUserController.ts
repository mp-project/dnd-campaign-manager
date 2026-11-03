import { RegisterUserSchema } from "#src/modules/users/domain/dto/RegisterUserDto";
import { RegisterUserUseCase } from "#src/modules/users/useCase/RegisterUserUseCase";
import { toRegisterUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";
import { AbstractController } from "#core/http/controller/AbstractController";

export class RegisterUserController extends AbstractController {
  constructor(private readonly registerUserUseCase: RegisterUserUseCase) {
    super();
  }

  handle = async (request: {
    body: unknown;
    ip: string;
    headers: { "user-agent"?: string | undefined };
  }) =>
    this.execute(async () => {
      const body = RegisterUserSchema.parse(request.body);
      const result = await this.registerUserUseCase.execute(body, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });

      return toRegisterUserResponse({
        user: result.user,
        verificationId: result.verificationRequest.id,
        verificationCode: result.verificationCode,
      });
    });
}
