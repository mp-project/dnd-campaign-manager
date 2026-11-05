import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestNoteItemParamsSchema } from "#src/modules/notes/domain/dto/RequestNoteDto";
import { NoteLifecycleCommandSchema } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { RestoreNoteUseCase } from "#src/modules/notes/useCase/RestoreNoteUseCase";

export class RestoreNoteController extends AbstractController {
  constructor(private readonly useCase: RestoreNoteUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestNoteItemParamsSchema.parse(request.params);
      const command = NoteLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
