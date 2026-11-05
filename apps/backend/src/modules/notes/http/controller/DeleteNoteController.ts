import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestNoteItemParamsSchema } from "#src/modules/notes/domain/dto/RequestNoteDto";
import { NoteLifecycleCommandSchema } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { DeleteNoteUseCase } from "#src/modules/notes/useCase/DeleteNoteUseCase";

export class DeleteNoteController extends AbstractController {
  constructor(private readonly useCase: DeleteNoteUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestNoteItemParamsSchema.parse(request.params);
      const command = NoteLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
