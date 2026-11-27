import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatParamsSchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { GetFeatUseCase } from "#src/modules/feats/useCase/GetFeatUseCase";

export class GetFeatController extends AbstractController {
  constructor(private readonly useCase: GetFeatUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestFeatParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
