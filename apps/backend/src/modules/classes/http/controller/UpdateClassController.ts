import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import { UpdateClassSchema } from "#src/modules/classes/domain/dto/UpdateClassDto";
import type { UpdateClassUseCase } from "#src/modules/classes/useCase/UpdateClassUseCase";

export class UpdateClassController extends AbstractController {
  constructor(private readonly useCase: UpdateClassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, classId } = RequestClassParamsSchema.parse(request.params);
      const command = UpdateClassSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        classId,
        command,
      });
    });
}
