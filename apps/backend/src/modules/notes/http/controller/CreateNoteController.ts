import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateNoteSchema } from "#src/modules/notes/domain/dto/CreateNoteDto";
import { RequestNotesParamsSchema } from "#src/modules/notes/domain/dto/RequestNoteDto";
import { CreateNoteUseCase } from "#src/modules/notes/useCase/CreateNoteUseCase";

export class CreateNoteController extends AbstractController {
  constructor(private readonly useCase: CreateNoteUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestNotesParamsSchema.parse(request.params);
      const command = CreateNoteSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
