import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateFeatSchema } from "#src/modules/feats/domain/dto/CreateFeatDto";
import { RequestFeatScopeParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { CreateFeatUseCase } from "#src/modules/feats/useCase/CreateFeatUseCase";

export class CreateFeatController extends AbstractController {
  constructor(private readonly useCase: CreateFeatUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = RequestFeatScopeParamsSchema.parse(request.params ?? {});
      const command = CreateFeatSchema.parse(request.body);

      return this.created(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, command }),
      );
    });
}
