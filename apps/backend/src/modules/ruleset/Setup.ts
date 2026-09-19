import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { rulesetPermissionDefinitions } from "#src/modules/ruleset/permissions/RulesetPermissions";
import { RULESET_HTTP_PREFIX } from "#src/modules/ruleset/config/RulesetHttpConfig";
import { CreateRulesetController } from "#src/modules/ruleset/http/controller/CreateRulesetController";
import { DeleteRulesetController } from "#src/modules/ruleset/http/controller/DeleteRulesetController";
import { GetRulesetByIdController } from "#src/modules/ruleset/http/controller/GetRulesetByIdController";
import { ListRulesetsController } from "#src/modules/ruleset/http/controller/ListRulesetsController";
import { UpdateRulesetController } from "#src/modules/ruleset/http/controller/UpdateRulesetController";
import { ValidateRulesetController } from "#src/modules/ruleset/http/controller/ValidateRulesetController";
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
  useCases: {
    listRulesets: ListRulesetsUseCase;
    getRulesetById: GetRulesetByIdUseCase;
    createRuleset: CreateRulesetUseCase;
    updateRuleset: UpdateRulesetUseCase;
    deleteRuleset: DeleteRulesetUseCase;
    validateRuleset: ValidateRulesetUseCase;
  };
};

async function registerRulesetModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const repository = new RulesetRepository();
  const service = new RulesetService(container.db, container.transactionManager, repository);
  const listRulesetsUseCase = new ListRulesetsUseCase(service);
  const getRulesetByIdUseCase = new GetRulesetByIdUseCase(service);
  const createRulesetUseCase = new CreateRulesetUseCase(service);
  const updateRulesetUseCase = new UpdateRulesetUseCase(service);
  const deleteRulesetUseCase = new DeleteRulesetUseCase(service);
  const validateRulesetUseCase = new ValidateRulesetUseCase(service);

  const moduleDependencies: RulesetModuleDependencies = {
    repository,
    service,
    useCases: {
      listRulesets: listRulesetsUseCase,
      getRulesetById: getRulesetByIdUseCase,
      createRuleset: createRulesetUseCase,
      updateRuleset: updateRulesetUseCase,
      deleteRuleset: deleteRulesetUseCase,
      validateRuleset: validateRulesetUseCase,
    },
  };

  container.dependencies.set(RULESET_MODULE_DEPENDENCIES, moduleDependencies);

  const listRulesetsController = new ListRulesetsController(listRulesetsUseCase);
  const getRulesetByIdController = new GetRulesetByIdController(getRulesetByIdUseCase);
  const createRulesetController = new CreateRulesetController(createRulesetUseCase);
  const updateRulesetController = new UpdateRulesetController(updateRulesetUseCase);
  const deleteRulesetController = new DeleteRulesetController(deleteRulesetUseCase);
  const validateRulesetController = new ValidateRulesetController(validateRulesetUseCase);

  app.register(
    async (rulesetApp) => {
      registerRulesetRoutes(rulesetApp, {
        listRulesetsController,
        getRulesetByIdController,
        createRulesetController,
        updateRulesetController,
        deleteRulesetController,
        validateRulesetController,
      });
    },
    { prefix: RULESET_HTTP_PREFIX },
  );
}

export const rulesetModule: AppModule = {
  name: "ruleset",
  dependencies: ["system"],
  permissions: rulesetPermissionDefinitions,
  register: registerRulesetModule,
};
