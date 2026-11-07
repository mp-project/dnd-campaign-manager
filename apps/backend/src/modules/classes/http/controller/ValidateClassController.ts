import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestClassParamsSchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ValidateClassUseCase } from "#src/modules/classes/useCase/ValidateClassUseCase";

export class ValidateClassController extends AbstractController {
  constructor(private readonly useCase: ValidateClassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, classId } = RequestClassParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        classId,
      });
    });
}
