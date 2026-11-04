import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestHistoryVersionParamsSchema, RestoreHistoryVersionSchema } from "#src/modules/history/domain/dto/RequestHistoryDto";
import { RestoreHistoryVersionUseCase } from "#src/modules/history/useCase/RestoreHistoryVersionUseCase";

export class RestoreHistoryVersionController extends AbstractController {
  constructor(private readonly useCase: RestoreHistoryVersionUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestHistoryVersionParamsSchema.parse(request.params);
      const body = RestoreHistoryVersionSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, params, body);
    });
}
