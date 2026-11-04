import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { rulesetPermissionDefinitions } from "#src/modules/ruleset/permissions/RulesetPermissions";
import { CreateRulesetController } from "#src/modules/ruleset/http/controller/CreateRulesetController";
import { DeleteRulesetController } from "#src/modules/ruleset/http/controller/DeleteRulesetController";
import { GetRulesetByIdController } from "#src/modules/ruleset/http/controller/GetRulesetByIdController";
import { ListRulesetsController } from "#src/modules/ruleset/http/controller/ListRulesetsController";
import { UpdateRulesetController } from "#src/modules/ruleset/http/controller/UpdateRulesetController";
import { ValidateRulesetController } from "#src/modules/ruleset/http/controller/ValidateRulesetController";
import { trackedRuleset } from "#src/modules/ruleset/history/TrackedRuleset";
import { RulesetRepository } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { registerRulesetRoutes } from "#src/modules/ruleset/http/routes/v1/RulesetRoutes";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";
import { CreateRulesetUseCase } from "#src/modules/ruleset/useCase/CreateRulesetUseCase";
import { DeleteRulesetUseCase } from "#src/modules/ruleset/useCase/DeleteRulesetUseCase";
import { GetRulesetByIdUseCase } from "#src/modules/ruleset/useCase/GetRulesetByIdUseCase";
import { ListRulesetsUseCase } from "#src/modules/ruleset/useCase/ListRulesetsUseCase";
import { UpdateRulesetUseCase } from "#src/modules/ruleset/useCase/UpdateRulesetUseCase";
import { ValidateRulesetUseCase } from "#src/modules/ruleset/useCase/ValidateRulesetUseCase";

export const RULESET_MODULE_DEPENDENCIES = "ruleset.module.dependencies";

export type RulesetModuleDependencies = {
  repository: RulesetRepository;
  service: RulesetService;
};

async function registerRulesetModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "ruleset",
    rulesetPermissionDefinitions,
  );

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  history.register(trackedRuleset);

  const repository = new RulesetRepository();
  const service = new RulesetService(container.db, container.transactionManager, repository);

  container.dependencies.set<RulesetModuleDependencies>(RULESET_MODULE_DEPENDENCIES, {
    repository,
    service,
  });

  app.register(async (rulesetApp) => {
    registerRulesetRoutes(rulesetApp, {
      listRulesetsController: new ListRulesetsController(new ListRulesetsUseCase(service)),
      getRulesetByIdController: new GetRulesetByIdController(new GetRulesetByIdUseCase(service)),
      createRulesetController: new CreateRulesetController(new CreateRulesetUseCase(history, service)),
      updateRulesetController: new UpdateRulesetController(new UpdateRulesetUseCase(history, service)),
      deleteRulesetController: new DeleteRulesetController(new DeleteRulesetUseCase(history, service)),
      validateRulesetController: new ValidateRulesetController(new ValidateRulesetUseCase(service)),
    });
  });
}

export const rulesetModule: AppModule = {
  name: "ruleset",
  dependencies: ["system", "history"],
  register: registerRulesetModule,
};
