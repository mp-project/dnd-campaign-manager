import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import { BackgroundLifecycleCommandSchema } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import type { DeleteBackgroundUseCase } from "#src/modules/backgrounds/useCase/DeleteBackgroundUseCase";

export class DeleteBackgroundController extends AbstractController {
  constructor(private readonly useCase: DeleteBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, backgroundId } = RequestBackgroundParamsSchema.parse(request.params);
      const command = BackgroundLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        backgroundId,
        command,
      });
    });
}
