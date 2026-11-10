import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignBackgroundParamsSchema,
  ResolveBackgroundSchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ResolveBackgroundUseCase } from "#src/modules/backgrounds/useCase/ResolveBackgroundUseCase";

export class ResolveBackgroundController extends AbstractController {
  constructor(private readonly useCase: ResolveBackgroundUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignBackgroundParamsSchema.parse(request.params);
      const command = ResolveBackgroundSchema.parse(request.body ?? {});

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
