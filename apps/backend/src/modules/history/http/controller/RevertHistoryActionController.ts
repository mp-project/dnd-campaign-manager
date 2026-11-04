import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestHistoryActionParamsSchema, RevertHistoryActionSchema } from "#src/modules/history/domain/dto/RequestHistoryDto";
import { RevertHistoryActionUseCase } from "#src/modules/history/useCase/RevertHistoryActionUseCase";

export class RevertHistoryActionController extends AbstractController {
  constructor(private readonly useCase: RevertHistoryActionUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestHistoryActionParamsSchema.parse(request.params);
      const body = RevertHistoryActionSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, params.actionId, body);
    });
}
