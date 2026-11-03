import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseValidateRulesetDto } from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class ValidateRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    rulesetId: string,
  ): Promise<ResponseValidateRulesetDto> {
    const { db, repository } = this.rulesetService;
    this.rulesetService.assertAuthenticated(context);

    const ruleset = await repository.findById(db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return {
      status: "ok",
      rulesetId,
      compatible: ruleset.status === "ACTIVE",
    };
  }
}
