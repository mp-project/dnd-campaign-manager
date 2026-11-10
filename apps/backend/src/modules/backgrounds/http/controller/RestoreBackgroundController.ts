import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestBackgroundParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import { BackgroundLifecycleCommandSchema } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import type { RestoreBackgroundUseCase } from "#src/modules/backgrounds/useCase/RestoreBackgroundUseCase";

export class RestoreBackgroundController extends AbstractController {
  constructor(private readonly useCase: RestoreBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, backgroundId } = RequestBackgroundParamsSchema.parse(request.params);
      const command = BackgroundLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        backgroundId,
        command,
      });
    });
}
