import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import { UpdateBackgroundSchema } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import type { UpdateBackgroundUseCase } from "#src/modules/backgrounds/useCase/UpdateBackgroundUseCase";

export class UpdateBackgroundController extends AbstractController {
  constructor(private readonly useCase: UpdateBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, backgroundId } = RequestBackgroundParamsSchema.parse(request.params);
      const command = UpdateBackgroundSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        backgroundId,
        command,
      });
    });
}
