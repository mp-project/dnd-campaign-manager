import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ValidateBackgroundUseCase } from "#src/modules/backgrounds/useCase/ValidateBackgroundUseCase";

export class ValidateBackgroundController extends AbstractController {
  constructor(private readonly useCase: ValidateBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, backgroundId } = RequestBackgroundParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, backgroundId });
    });
}
