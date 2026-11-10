import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  BackgroundFeatOptionsSchema,
  RequestCampaignBackgroundParamsSchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { GetBackgroundFeatOptionsUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundFeatOptionsUseCase";

export class GetBackgroundFeatOptionsController extends AbstractController {
  constructor(private readonly useCase: GetBackgroundFeatOptionsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignBackgroundParamsSchema.parse(request.params);
      const command = BackgroundFeatOptionsSchema.parse(request.body ?? {});

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
