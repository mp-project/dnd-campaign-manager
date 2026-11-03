import {
  ConflictError,
  NotFoundError,
  VersionConflictError,
} from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseRulesetDto,
  toRulesetResponse,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import type { UpdateRulesetDto } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class UpdateRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    rulesetId: string,
    input: UpdateRulesetDto,
  ): Promise<ResponseRulesetDto> {
    const { db, repository } = this.rulesetService;
    const actorId = this.rulesetService.assertAuthenticated(context);

    const current = await repository.findById(db, rulesetId);

    if (!current) {
      throw new NotFoundError("Ruleset not found");
    }

    const nextStatus = input.status ?? current.status;

    if (
      nextStatus === "ACTIVE" &&
      (await repository.isActiveCodeTaken(db, current.code, rulesetId))
    ) {
      throw new ConflictError(`Ruleset code '${current.code}' is already in use`);
    }

    const { expectedVersion, ...patch } = input;

    const updated = await repository.update(db, {
      rulesetId,
      actorId,
      expectedVersion,
      patch,
    });

    if (!updated) {
      throw new VersionConflictError("Ruleset update version mismatch");
    }

    return toRulesetResponse(updated);
  }
}
