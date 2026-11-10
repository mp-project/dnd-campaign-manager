import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSubclassParamsSchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import { UpdateSubclassSchema } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import type { UpdateSubclassUseCase } from "#src/modules/subclasses/useCase/UpdateSubclassUseCase";

export class UpdateSubclassController extends AbstractController {
  constructor(private readonly useCase: UpdateSubclassUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, subclassId } = RequestSubclassParamsSchema.parse(request.params);
      const command = UpdateSubclassSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        subclassId,
        command,
      });
    });
}
