import { ConflictError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateRulesetDto } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import {
  type ResponseRulesetDto,
  toRulesetResponse,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import { RULESET_ACTIONS, trackedRuleset } from "#src/modules/ruleset/history/TrackedRuleset";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class CreateRulesetUseCase extends MutationUseCase<CreateRulesetDto, ResponseRulesetDto> {
  protected readonly action = RULESET_ACTIONS.create;

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
    context: RequestContext,
    input: CreateRulesetDto,
  ): Promise<ResponseRulesetDto> {
    const { repository } = this.rulesetService;
    const { levelProgressions, spellSlotProgressions, ...fields } = input;

    if (await repository.isActiveCodeTaken(scope.tx, input.code)) {
      throw new ConflictError(`Ruleset code '${input.code}' is already in use`);
    }

    const ruleset = await scope.create(trackedRuleset, { ...fields, status: "ACTIVE" });

    await repository.createProgressions(scope.tx, {
      rulesetId: ruleset.id,
      actorId: context.actorId as string,
      levelProgressions,
      spellSlotProgressions,
    });

    return toRulesetResponse(await this.rulesetService.loadAggregate(scope.tx, ruleset.id));
  }
}
