import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestNoteItemParamsSchema } from "#src/modules/notes/domain/dto/RequestNoteDto";
import { GetNoteUseCase } from "#src/modules/notes/useCase/GetNoteUseCase";

export class GetNoteController extends AbstractController {
  constructor(private readonly useCase: GetNoteUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestNoteItemParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
