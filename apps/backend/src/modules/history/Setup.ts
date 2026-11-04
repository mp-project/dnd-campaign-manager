import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { HistoryRepository } from "#src/modules/history/domain/repository/HistoryRepository";
import { GetHistoryVersionController } from "#src/modules/history/http/controller/GetHistoryVersionController";
import { ListHistoryController } from "#src/modules/history/http/controller/ListHistoryController";
import { RestoreHistoryVersionController } from "#src/modules/history/http/controller/RestoreHistoryVersionController";
import { RevertHistoryActionController } from "#src/modules/history/http/controller/RevertHistoryActionController";
import { RevertHistoryEventController } from "#src/modules/history/http/controller/RevertHistoryEventController";
import { registerHistoryRoutes } from "#src/modules/history/http/routes/v1/HistoryRoutes";
import { historyPermissionDefinitions } from "#src/modules/history/permissions/HistoryPermissions";
import { HistoryService } from "#src/modules/history/service/HistoryService";
import { GetHistoryVersionUseCase } from "#src/modules/history/useCase/GetHistoryVersionUseCase";
import { ListHistoryUseCase } from "#src/modules/history/useCase/ListHistoryUseCase";
import { RestoreHistoryVersionUseCase } from "#src/modules/history/useCase/RestoreHistoryVersionUseCase";
import { RevertHistoryActionUseCase } from "#src/modules/history/useCase/RevertHistoryActionUseCase";
import { RevertHistoryEventUseCase } from "#src/modules/history/useCase/RevertHistoryEventUseCase";

async function registerHistoryModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "history",
    historyPermissionDefinitions,
  );

  const service = new HistoryService(
    container.db,
    container.transactionManager,
    new HistoryRepository(),
    app.log,
  );

  container.ports.history = service;

  app.register(async (historyApp) => {
    registerHistoryRoutes(historyApp, {
      listHistoryController: new ListHistoryController(new ListHistoryUseCase(service)),
      getHistoryVersionController: new GetHistoryVersionController(
        new GetHistoryVersionUseCase(service),
      ),
      revertHistoryEventController: new RevertHistoryEventController(
        new RevertHistoryEventUseCase(service),
      ),
      revertHistoryActionController: new RevertHistoryActionController(
        new RevertHistoryActionUseCase(service),
      ),
      restoreHistoryVersionController: new RestoreHistoryVersionController(
        new RestoreHistoryVersionUseCase(service),
      ),
    });
  });
}

export const historyModule: AppModule = {
  name: "history",
  dependencies: ["system", "auth"],
  register: registerHistoryModule,
};
