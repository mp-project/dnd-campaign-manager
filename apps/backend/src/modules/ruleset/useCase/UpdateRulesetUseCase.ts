import { ConflictError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateRulesetDto,
  toUpdateRulesetResponse,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import type { UpdateRulesetDto } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import { RULESET_ACTIONS, trackedRuleset } from "#src/modules/ruleset/history/TrackedRuleset";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export type UpdateRulesetInput = {
  rulesetId: string;
  command: UpdateRulesetDto;
};

export class UpdateRulesetUseCase extends MutationUseCase<
  UpdateRulesetInput,
  ResponseUpdateRulesetDto
> {
  protected readonly action = RULESET_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly rulesetService: RulesetService,
  ) {
    super(history);
  }

  /** Rulesets are global, so the permission on the route is the whole check. */
  protected async authorize(context: RequestContext): Promise<Authorization> {
    this.rulesetService.assertAuthenticated(context);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: UpdateRulesetInput,
  ): Promise<ResponseUpdateRulesetDto> {
    const { repository } = this.rulesetService;
    const { rulesetId, command } = input;
    const { expectedVersion, ...fields } = command;
    const set = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );

    await this.rulesetService.loadAggregate(scope.tx, rulesetId);

    const { merged } = await scope.change(trackedRuleset, rulesetId, async (current) => {
      if (
        (command.status ?? current.status) === "ACTIVE" &&
        (await repository.isActiveCodeTaken(scope.tx, current.code, rulesetId))
      ) {
        throw new ConflictError(`Ruleset code '${current.code}' is already in use`);
      }

      return { set, baseVersion: expectedVersion };
    });

    return toUpdateRulesetResponse(
      await this.rulesetService.loadAggregate(scope.tx, rulesetId),
      merged,
    );
  }
}
