import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestMediaLinkContentParamsSchema } from "#src/modules/media/domain/dto/MediaLinkDto";
import { GetMediaLinkContentUseCase } from "#src/modules/media/useCase/GetMediaLinkContentUseCase";

export class GetMediaLinkContentController extends AbstractController {
  constructor(private readonly useCase: GetMediaLinkContentUseCase) {
    super();
  }

  handle = async (request: { params: unknown }) =>
    this.execute(async () =>
      this.useCase.execute(RequestMediaLinkContentParamsSchema.parse(request.params)),
    );
}
