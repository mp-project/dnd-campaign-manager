import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { UpdateSettingsSchema } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import { UpdateSettingsUseCase } from "#src/modules/users/useCase/UpdateSettingsUseCase";

export class UpdateSettingsController extends AbstractController {
  constructor(private readonly updateSettingsUseCase: UpdateSettingsUseCase) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = UpdateSettingsSchema.parse(request.body);

      return this.updateSettingsUseCase.execute(request.requestContext, body);
    });
}
