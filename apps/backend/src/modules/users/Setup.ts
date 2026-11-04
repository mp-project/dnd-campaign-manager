import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  AUTH_SESSION_DEPENDENCIES,
  type AuthSessionDependencies,
} from "#src/modules/auth/index";
import { trackedUser } from "#src/modules/users/history/TrackedUser";
import { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";
import { DeleteUserController } from "#src/modules/users/http/controller/DeleteUserController";
import { GetMeController } from "#src/modules/users/http/controller/GetMeController";
import { GetMyCampaignOverviewController } from "#src/modules/users/http/controller/GetMyCampaignOverviewController";
import { GetUserByIdController } from "#src/modules/users/http/controller/GetUserByIdController";
import { ListUsersController } from "#src/modules/users/http/controller/ListUsersController";
import { UpdateMeController } from "#src/modules/users/http/controller/UpdateMeController";
import { UpdateSettingsController } from "#src/modules/users/http/controller/UpdateSettingsController";
import { UpdateUserController } from "#src/modules/users/http/controller/UpdateUserController";
import { registerUsersRoutes } from "#src/modules/users/http/routes/v1/UsersRoutes";
import { usersPermissionDefinitions } from "#src/modules/users/permissions/UsersPermissions";
import { UsersService } from "#src/modules/users/service/UsersService";
import { DeleteUserUseCase } from "#src/modules/users/useCase/DeleteUserUseCase";
import { GetMeUseCase } from "#src/modules/users/useCase/GetMeUseCase";
import { GetMyCampaignOverviewUseCase } from "#src/modules/users/useCase/GetMyCampaignOverviewUseCase";
import { GetOneUserByUseCase } from "#src/modules/users/useCase/GetOneUserByUseCase";
import { GetUserByIdUseCase } from "#src/modules/users/useCase/GetUserByIdUseCase";
import { ListUsersUseCase } from "#src/modules/users/useCase/ListUsersUseCase";
import { UpdateMeUseCase } from "#src/modules/users/useCase/UpdateMeUseCase";
import { UpdateSettingsUseCase } from "#src/modules/users/useCase/UpdateSettingsUseCase";
import { UpdateUserUseCase } from "#src/modules/users/useCase/UpdateUserUseCase";

export const USERS_MODULE_DEPENDENCIES = "users.module.dependencies";

export type UsersModuleDependencies = {
  repository: UsersRepository;
  service: UsersService;
  useCases: {
    getOneUserBy: GetOneUserByUseCase;
  };
};

async function registerUsersModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "users",
    usersPermissionDefinitions,
  );

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  history.register(trackedUser);

  const repository = new UsersRepository();
  const service = new UsersService(
    container.db,
    container.transactionManager,
    repository,
    history,
    container.ports.permissionService,
    container.dependencies.get<AuthSessionDependencies>(AUTH_SESSION_DEPENDENCIES),
  );

  container.dependencies.set<UsersModuleDependencies>(USERS_MODULE_DEPENDENCIES, {
    repository,
    service,
    useCases: {
      getOneUserBy: new GetOneUserByUseCase(service),
    },
  });

  app.register(async (usersApp) => {
    registerUsersRoutes(usersApp, {
      getMeController: new GetMeController(new GetMeUseCase(service)),
      updateMeController: new UpdateMeController(new UpdateMeUseCase(service)),
      updateSettingsController: new UpdateSettingsController(new UpdateSettingsUseCase(service)),
      getMyCampaignOverviewController: new GetMyCampaignOverviewController(
        new GetMyCampaignOverviewUseCase(service),
      ),
      listUsersController: new ListUsersController(new ListUsersUseCase(service)),
      getUserByIdController: new GetUserByIdController(new GetUserByIdUseCase(service)),
      updateUserController: new UpdateUserController(new UpdateUserUseCase(service)),
      deleteUserController: new DeleteUserController(new DeleteUserUseCase(service)),
    });
  });
}

export const usersModule: AppModule = {
  name: "users",
  dependencies: ["system", "auth", "history"],
  register: registerUsersModule,
};
