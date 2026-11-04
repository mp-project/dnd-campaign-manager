import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestHistoryEventParamsSchema, RevertHistoryEventSchema } from "#src/modules/history/domain/dto/RequestHistoryDto";
import { RevertHistoryEventUseCase } from "#src/modules/history/useCase/RevertHistoryEventUseCase";

export class RevertHistoryEventController extends AbstractController {
  constructor(private readonly useCase: RevertHistoryEventUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestHistoryEventParamsSchema.parse(request.params);
      const body = RevertHistoryEventSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, params.eventId, body);
    });
}
