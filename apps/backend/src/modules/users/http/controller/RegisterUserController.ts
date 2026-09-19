import { RegisterUserSchema } from "#src/modules/users/domain/dto/RegisterUserDto";
import { RegisterUserUseCase } from "#src/modules/users/useCase/RegisterUserUseCase";
import { toRegisterUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class RegisterUserController {
  constructor(private readonly registerUserUseCase: RegisterUserUseCase) {}

  handle = async (request: { body: unknown }) => {
    const body = RegisterUserSchema.parse(request.body);
    const result = await this.registerUserUseCase.execute(body);

    return toRegisterUserResponse({
      user: result.user,
      verificationId: result.verificationRequest.id,
      verificationCode: result.verificationCode,
    });
  };
}
