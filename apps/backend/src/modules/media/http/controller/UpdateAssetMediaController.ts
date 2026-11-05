import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestAssetMediaItemParamsSchema,
  UpdateAssetMediaSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { UpdateAssetMediaUseCase } from "#src/modules/media/useCase/UpdateAssetMediaUseCase";

export class UpdateAssetMediaController extends AbstractController {
  constructor(private readonly useCase: UpdateAssetMediaUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetMediaItemParamsSchema.parse(request.params);
      const command = UpdateAssetMediaSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
