import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateClassSchema } from "#src/modules/classes/domain/dto/CreateClassDto";
import { RequestClassScopeParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { CreateClassUseCase } from "#src/modules/classes/useCase/CreateClassUseCase";

export class CreateClassController extends AbstractController {
  constructor(private readonly useCase: CreateClassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId } = RequestClassScopeParamsSchema.parse(request.params ?? {});
      const command = CreateClassSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        command,
      });
    });
}
