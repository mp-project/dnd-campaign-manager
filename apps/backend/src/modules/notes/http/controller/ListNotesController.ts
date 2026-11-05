import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestNotesParamsSchema,
  RequestNotesQuerySchema,
} from "#src/modules/notes/domain/dto/RequestNoteDto";
import { ListNotesUseCase } from "#src/modules/notes/useCase/ListNotesUseCase";

export class ListNotesController extends AbstractController {
  constructor(private readonly useCase: ListNotesUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestNotesParamsSchema.parse(request.params);
      const query = RequestNotesQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}
