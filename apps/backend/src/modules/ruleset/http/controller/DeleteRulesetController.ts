import type { RequestContext } from "#core/http/requestContext";
import type { FastifyReply } from "fastify";
import { DeleteRulesetSchema } from "#src/modules/ruleset/domain/dto/DeleteRulesetDto";
import { DeleteRulesetUseCase } from "#src/modules/ruleset/useCase/DeleteRulesetUseCase";

export class DeleteRulesetController {
  constructor(private readonly deleteRulesetUseCase: DeleteRulesetUseCase) {}

  handle = async (
    request: { params: unknown; requestContext: RequestContext },
    reply: FastifyReply,
  ) => {
    const params = DeleteRulesetSchema.parse(request.params);

    await this.deleteRulesetUseCase.execute(request.requestContext, params.rulesetId);

    return reply.code(204).send();
  };
}
