import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSpellParamsSchema,
  ResolveSpellSchema,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ResolveSpellUseCase } from "#src/modules/spells/useCase/ResolveSpellUseCase";

export class ResolveSpellController extends AbstractController {
  constructor(private readonly useCase: ResolveSpellUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignSpellParamsSchema.parse(request.params);
      const command = ResolveSpellSchema.parse(request.body ?? {});

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
