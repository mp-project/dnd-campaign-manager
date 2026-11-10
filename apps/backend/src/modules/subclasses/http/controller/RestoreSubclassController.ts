import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import { SubclassLifecycleCommandSchema } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import type { RestoreSubclassUseCase } from "#src/modules/subclasses/useCase/RestoreSubclassUseCase";

export class RestoreSubclassController extends AbstractController {
  constructor(private readonly useCase: RestoreSubclassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, subclassId } = RequestSubclassParamsSchema.parse(request.params);
      const command = SubclassLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        subclassId,
        command,
      });
    });
}
