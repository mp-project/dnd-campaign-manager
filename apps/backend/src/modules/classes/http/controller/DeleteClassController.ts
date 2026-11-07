import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import { ClassLifecycleCommandSchema } from "#src/modules/classes/domain/dto/UpdateClassDto";
import type { DeleteClassUseCase } from "#src/modules/classes/useCase/DeleteClassUseCase";

export class DeleteClassController extends AbstractController {
  constructor(private readonly useCase: DeleteClassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, classId } = RequestClassParamsSchema.parse(request.params);
      const command = ClassLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        classId,
        command,
      });
    });
}
