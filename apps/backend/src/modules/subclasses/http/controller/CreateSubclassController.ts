import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateSubclassSchema } from "#src/modules/subclasses/domain/dto/CreateSubclassDto";
import { RequestSubclassScopeParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { CreateSubclassUseCase } from "#src/modules/subclasses/useCase/CreateSubclassUseCase";

export class CreateSubclassController extends AbstractController {
  constructor(private readonly useCase: CreateSubclassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId } = RequestSubclassScopeParamsSchema.parse(request.params ?? {});
      const command = CreateSubclassSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        command,
      });
    });
}
