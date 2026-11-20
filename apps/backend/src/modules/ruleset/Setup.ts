import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { reportError } from "#core/log/reportError";
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
import { ensureDefaultRulesets } from "#src/modules/ruleset/defaults/ensureDefaultRulesets";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";
import { CreateRulesetUseCase } from "#src/modules/ruleset/useCase/CreateRulesetUseCase";
import { DeleteRulesetUseCase } from "#src/modules/ruleset/useCase/DeleteRulesetUseCase";
import { GetRulesetByIdUseCase } from "#src/modules/ruleset/useCase/GetRulesetByIdUseCase";
import { ListRulesetsUseCase } from "#src/modules/ruleset/useCase/ListRulesetsUseCase";
import { UpdateRulesetUseCase } from "#src/modules/ruleset/useCase/UpdateRulesetUseCase";
import { ValidateRulesetUseCase } from "#src/modules/ruleset/useCase/ValidateRulesetUseCase";

export const RULESET_MODULE_DEPENDENCIES = "ruleset.module.dependencies";

const DEFAULT_RULESETS_RETRY_MS = 30_000;

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

  // The default rulesets, so a campaign can be created without a manual seed. A database that
  // isn't reachable or migrated yet must not stop the app (`/ready` reports it): a failed attempt
  // is logged and tried again.
  if (container.config.DEFAULT_RULESETS_ON_START) {
    let retry: NodeJS.Timeout | undefined;
    let failures = 0;
    const ensureDefaults = async (): Promise<void> => {
      try {
        const created = await ensureDefaultRulesets(container.db);
        if (created > 0) app.log.info({ created }, "Default rulesets created");
      } catch (err) {
        // Reported once; the retries that follow only warn, so a database that takes a while to
        // come up doesn't flood the reports.
        if (failures === 0) {
          reportError(app.log, err, "Default rulesets could not be created; trying again", {
            task: "ruleset.defaults",
          });
        } else {
          app.log.warn({ err, failures }, "Default rulesets could still not be created");
        }

        failures += 1;
        retry = setTimeout(() => void ensureDefaults(), DEFAULT_RULESETS_RETRY_MS);
        retry.unref();
      }
    };

    app.addHook("onReady", ensureDefaults);
    app.addHook("onClose", async () => clearTimeout(retry));
  }

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
