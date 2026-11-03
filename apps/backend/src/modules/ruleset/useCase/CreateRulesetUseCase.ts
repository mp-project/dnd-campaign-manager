import { ConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateRulesetDto } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import {
  type ResponseRulesetDto,
  toRulesetResponse,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class CreateRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    input: CreateRulesetDto,
  ): Promise<ResponseRulesetDto> {
    const { repository, transactionManager } = this.rulesetService;
    const actorId = this.rulesetService.assertAuthenticated(context);

    const created = await transactionManager.inTransaction(async (tx) => {
      const codeTaken = await repository.isActiveCodeTaken(tx, input.code);

      if (codeTaken) {
        throw new ConflictError(`Ruleset code '${input.code}' is already in use`);
      }

      return repository.create(tx, { ...input, actorId });
    });

    return toRulesetResponse(created);
  }
}
