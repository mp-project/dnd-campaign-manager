import type { RequestContext } from "#core/http/requestContext";
import type { FastifyReply } from "fastify";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateRulesetSchema } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import { CreateRulesetUseCase } from "#src/modules/ruleset/useCase/CreateRulesetUseCase";
import { toRulesetResponse } from "#src/modules/ruleset/http/controller/RulesetResponseMapper";

export class CreateRulesetController extends AbstractController {
  constructor(private readonly createRulesetUseCase: CreateRulesetUseCase) {
    super();
  }

  handle = async (
    request: { body: unknown; requestContext: RequestContext },
    reply: FastifyReply,
  ) =>
    this.execute(async () => {
      const body = CreateRulesetSchema.parse(request.body);
      const created = await this.createRulesetUseCase.execute(request.requestContext, body);

      return reply.code(201).send(toRulesetResponse(created));
    });
}
