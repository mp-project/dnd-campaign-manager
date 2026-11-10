import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { ValidateSubclassUseCase } from "#src/modules/subclasses/useCase/ValidateSubclassUseCase";

export class ValidateSubclassController extends AbstractController {
  constructor(private readonly useCase: ValidateSubclassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, subclassId } = RequestSubclassParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        subclassId,
      });
    });
}
