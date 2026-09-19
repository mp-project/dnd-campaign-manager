import type { RequestContext } from "#core/http/requestContext";
import type { CreateRulesetDto } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import type { RulesetAggregate } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class CreateRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    input: CreateRulesetDto,
  ): Promise<RulesetAggregate> {
    return this.rulesetService.create(context, {
      code: input.code,
      name: input.name,
      description: input.description,
      editionYear: input.editionYear,
      sourceReference: input.sourceReference,
      licenseCode: input.licenseCode,
      attribution: input.attribution,
      levelProgressions: input.levelProgressions,
      spellSlotProgressions: input.spellSlotProgressions,
    });
  }
}
