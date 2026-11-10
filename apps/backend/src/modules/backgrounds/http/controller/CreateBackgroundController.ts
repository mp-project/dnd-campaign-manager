import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateBackgroundSchema } from "#src/modules/backgrounds/domain/dto/CreateBackgroundDto";
import { RequestBackgroundScopeParamsSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { CreateBackgroundUseCase } from "#src/modules/backgrounds/useCase/CreateBackgroundUseCase";

export class CreateBackgroundController extends AbstractController {
  constructor(private readonly useCase: CreateBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId } = RequestBackgroundScopeParamsSchema.parse(request.params ?? {});
      const command = CreateBackgroundSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, command });
    });
}
