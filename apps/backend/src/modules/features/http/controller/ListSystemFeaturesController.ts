import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemFeaturesQuerySchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { ListSystemFeaturesUseCase } from "#src/modules/features/useCase/ListSystemFeaturesUseCase";

export class ListSystemFeaturesController extends AbstractController {
  constructor(private readonly useCase: ListSystemFeaturesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestSystemFeaturesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
