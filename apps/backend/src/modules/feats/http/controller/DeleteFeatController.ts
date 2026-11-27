import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import { FeatLifecycleCommandSchema } from "#src/modules/feats/domain/dto/UpdateFeatDto";
import type { DeleteFeatUseCase } from "#src/modules/feats/useCase/DeleteFeatUseCase";

export class DeleteFeatController extends AbstractController {
  constructor(private readonly useCase: DeleteFeatUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);
      const command = FeatLifecycleCommandSchema.parse(request.query);

      return this.ok(
        await this.useCase.execute(request.requestContext, {
          campaignId: campaignId ?? null,
          featId,
          command,
        }),
      );
    });
}
