import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestNoteItemParamsSchema } from "#src/modules/notes/domain/dto/RequestNoteDto";
import { UpdateNoteSchema } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { UpdateNoteUseCase } from "#src/modules/notes/useCase/UpdateNoteUseCase";

export class UpdateNoteController extends AbstractController {
  constructor(private readonly useCase: UpdateNoteUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestNoteItemParamsSchema.parse(request.params);
      const command = UpdateNoteSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
