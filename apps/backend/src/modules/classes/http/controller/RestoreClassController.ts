import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import { ClassLifecycleCommandSchema } from "#src/modules/classes/domain/dto/UpdateClassDto";
import type { RestoreClassUseCase } from "#src/modules/classes/useCase/RestoreClassUseCase";

export class RestoreClassController extends AbstractController {
  constructor(private readonly useCase: RestoreClassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, classId } = RequestClassParamsSchema.parse(request.params);
      const command = ClassLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        classId,
        command,
      });
    });
}
