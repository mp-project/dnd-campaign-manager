import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateRulesetSchema } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import { CreateRulesetUseCase } from "#src/modules/ruleset/useCase/CreateRulesetUseCase";

export class CreateRulesetController extends AbstractController {
  constructor(private readonly createRulesetUseCase: CreateRulesetUseCase) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = CreateRulesetSchema.parse(request.body);

      return this.createRulesetUseCase.execute(request.requestContext, body);
    });
}
