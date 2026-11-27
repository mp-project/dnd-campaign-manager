import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import { FeatLifecycleCommandSchema } from "#src/modules/feats/domain/dto/UpdateFeatDto";
import type { RestoreFeatUseCase } from "#src/modules/feats/useCase/RestoreFeatUseCase";

export class RestoreFeatController extends AbstractController {
  constructor(private readonly useCase: RestoreFeatUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);
      const command = FeatLifecycleCommandSchema.parse(request.body);

      return this.ok(
        await this.useCase.execute(request.requestContext, {
          campaignId: campaignId ?? null,
          featId,
          command,
        }),
      );
    });
}
