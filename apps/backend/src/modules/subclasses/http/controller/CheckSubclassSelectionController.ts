import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSubclassParamsSchema,
  RequestSubclassSelectionCheckSchema,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { CheckSubclassSelectionUseCase } from "#src/modules/subclasses/useCase/CheckSubclassSelectionUseCase";

export class CheckSubclassSelectionController extends AbstractController {
  constructor(private readonly useCase: CheckSubclassSelectionUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignSubclassParamsSchema.parse(request.params);
      const command = RequestSubclassSelectionCheckSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
