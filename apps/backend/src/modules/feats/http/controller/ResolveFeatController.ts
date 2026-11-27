import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeatParamsSchema,
  ResolveFeatSchema,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ResolveFeatUseCase } from "#src/modules/feats/useCase/ResolveFeatUseCase";

export class ResolveFeatController extends AbstractController {
  constructor(private readonly useCase: ResolveFeatUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatParamsSchema.parse(request.params);
      const command = ResolveFeatSchema.parse(request.body ?? {});

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
