import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  AttachMediaSchema,
  RequestAssetMediaParamsSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { AttachMediaUseCase } from "#src/modules/media/useCase/AttachMediaUseCase";

export class AttachMediaController extends AbstractController {
  constructor(private readonly useCase: AttachMediaUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetMediaParamsSchema.parse(request.params);
      const command = AttachMediaSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
