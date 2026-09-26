import type { RequestContext } from "#core/http/requestContext";
import type { FastifyReply } from "fastify";
import { AbstractController } from "#core/http/controller/AbstractController";
import { DeleteRulesetSchema } from "#src/modules/ruleset/domain/dto/DeleteRulesetDto";
import { DeleteRulesetUseCase } from "#src/modules/ruleset/useCase/DeleteRulesetUseCase";

export class DeleteRulesetController extends AbstractController {
  constructor(private readonly deleteRulesetUseCase: DeleteRulesetUseCase) {
    super();
  }

  handle = async (
    request: { params: unknown; requestContext: RequestContext },
    reply: FastifyReply,
  ) =>
    this.execute(async () => {
      const params = DeleteRulesetSchema.parse(request.params);

      await this.deleteRulesetUseCase.execute(request.requestContext, params.rulesetId);

      return reply.code(204).send();
    });
}
