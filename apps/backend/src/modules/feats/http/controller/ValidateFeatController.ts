import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ValidateFeatUseCase } from "#src/modules/feats/useCase/ValidateFeatUseCase";

export class ValidateFeatController extends AbstractController {
  constructor(private readonly useCase: ValidateFeatUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, featId } = RequestFeatParamsSchema.parse(request.params);

      return this.ok(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, featId }),
      );
    });
}
