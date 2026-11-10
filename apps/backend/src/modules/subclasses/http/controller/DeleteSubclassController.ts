import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import { SubclassLifecycleCommandSchema } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import type { DeleteSubclassUseCase } from "#src/modules/subclasses/useCase/DeleteSubclassUseCase";

export class DeleteSubclassController extends AbstractController {
  constructor(private readonly useCase: DeleteSubclassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, subclassId } = RequestSubclassParamsSchema.parse(request.params);
      const command = SubclassLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        subclassId,
        command,
      });
    });
}
