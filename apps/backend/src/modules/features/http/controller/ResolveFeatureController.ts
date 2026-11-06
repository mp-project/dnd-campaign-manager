import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeatureParamsSchema,
  ResolveFeatureSchema,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { ResolveFeatureUseCase } from "#src/modules/features/useCase/ResolveFeatureUseCase";

export class ResolveFeatureController extends AbstractController {
  constructor(private readonly useCase: ResolveFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatureParamsSchema.parse(request.params);
      const command = ResolveFeatureSchema.parse(request.body ?? {});

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
