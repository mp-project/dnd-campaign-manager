import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestHistoryVersionParamsSchema } from "#src/modules/history/domain/dto/RequestHistoryDto";
import { GetHistoryVersionUseCase } from "#src/modules/history/useCase/GetHistoryVersionUseCase";

export class GetHistoryVersionController extends AbstractController {
  constructor(private readonly useCase: GetHistoryVersionUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestHistoryVersionParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
