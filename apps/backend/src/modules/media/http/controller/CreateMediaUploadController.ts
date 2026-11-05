import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  CreateMediaUploadSchema,
  RequestMediaParamsSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { CreateMediaUploadUseCase } from "#src/modules/media/useCase/CreateMediaUploadUseCase";

export class CreateMediaUploadController extends AbstractController {
  constructor(private readonly useCase: CreateMediaUploadUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaParamsSchema.parse(request.params);
      const command = CreateMediaUploadSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
