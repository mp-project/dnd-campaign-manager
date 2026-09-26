import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  AUTH_SESSION_DEPENDENCIES,
  type AuthSessionDependencies,
} from "#src/modules/auth/index";
import { USERS_HTTP_PREFIX } from "#src/modules/users/config/UsersHttpConfig";
import { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";
import { AdminGetUserByIdController } from "#src/modules/users/http/controller/AdminGetUserByIdController";
import { AdminListUsersController } from "#src/modules/users/http/controller/AdminListUsersController";
import { AdminUpdateUserController } from "#src/modules/users/http/controller/AdminUpdateUserController";
import { GetMeController } from "#src/modules/users/http/controller/GetMeController";
import { GetMyCampaignOverviewController } from "#src/modules/users/http/controller/GetMyCampaignOverviewController";
import { GetMyInvitationsController } from "#src/modules/users/http/controller/GetMyInvitationsController";
import { UpdateMeController } from "#src/modules/users/http/controller/UpdateMeController";
import { UpdateSettingsController } from "#src/modules/users/http/controller/UpdateSettingsController";
import { registerUsersRoutes } from "#src/modules/users/http/routes/v1/UsersRoutes";
import { usersPermissionDefinitions } from "#src/modules/users/permissions/UsersPermissions";
import { UsersService } from "#src/modules/users/service/UsersService";
import { AdminGetUserByIdUseCase } from "#src/modules/users/useCase/AdminGetUserByIdUseCase";
import { AdminListUsersUseCase } from "#src/modules/users/useCase/AdminListUsersUseCase";
import { AdminUpdateUserUseCase } from "#src/modules/users/useCase/AdminUpdateUserUseCase";
import { GetMeUseCase } from "#src/modules/users/useCase/GetMeUseCase";
import { GetMyCampaignOverviewUseCase } from "#src/modules/users/useCase/GetMyCampaignOverviewUseCase";
import { GetMyInvitationsUseCase } from "#src/modules/users/useCase/GetMyInvitationsUseCase";
import { UpdateMeUseCase } from "#src/modules/users/useCase/UpdateMeUseCase";
import { UpdateSettingsUseCase } from "#src/modules/users/useCase/UpdateSettingsUseCase";

export const USERS_MODULE_DEPENDENCIES = "users.module.dependencies";

export type UsersModuleDependencies = {
  repository: UsersRepository;
  service: UsersService;
  useCases: {
    getMe: GetMeUseCase;
    updateMe: UpdateMeUseCase;
    updateSettings: UpdateSettingsUseCase;
    getMyCampaignOverview: GetMyCampaignOverviewUseCase;
    getMyInvitations: GetMyInvitationsUseCase;
    adminListUsers: AdminListUsersUseCase;
    adminGetUserById: AdminGetUserByIdUseCase;
    adminUpdateUser: AdminUpdateUserUseCase;
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

  const repository = new UsersRepository();
  const authSessionDependencies =
    container.dependencies.get<AuthSessionDependencies>(AUTH_SESSION_DEPENDENCIES);
  const service = new UsersService(
    container.db,
    container.transactionManager,
    repository,
    container.ports.permissionService,
    authSessionDependencies,
  );

  const getMeUseCase = new GetMeUseCase(service);
  const updateMeUseCase = new UpdateMeUseCase(service);
  const updateSettingsUseCase = new UpdateSettingsUseCase(service);
  const getMyCampaignOverviewUseCase = new GetMyCampaignOverviewUseCase(service);
  const getMyInvitationsUseCase = new GetMyInvitationsUseCase(service);
  const adminListUsersUseCase = new AdminListUsersUseCase(service);
  const adminGetUserByIdUseCase = new AdminGetUserByIdUseCase(service);
  const adminUpdateUserUseCase = new AdminUpdateUserUseCase(service);

  const moduleDependencies: UsersModuleDependencies = {
    repository,
    service,
    useCases: {
      getMe: getMeUseCase,
      updateMe: updateMeUseCase,
      updateSettings: updateSettingsUseCase,
      getMyCampaignOverview: getMyCampaignOverviewUseCase,
      getMyInvitations: getMyInvitationsUseCase,
      adminListUsers: adminListUsersUseCase,
      adminGetUserById: adminGetUserByIdUseCase,
      adminUpdateUser: adminUpdateUserUseCase,
    },
  };

  container.dependencies.set(USERS_MODULE_DEPENDENCIES, moduleDependencies);

  const getMeController = new GetMeController(getMeUseCase, service);
  const updateMeController = new UpdateMeController(updateMeUseCase, service);
  const updateSettingsController = new UpdateSettingsController(
    updateSettingsUseCase,
    service,
  );
  const getMyCampaignOverviewController = new GetMyCampaignOverviewController(
    getMyCampaignOverviewUseCase,
  );
  const getMyInvitationsController = new GetMyInvitationsController(
    getMyInvitationsUseCase,
  );
  const adminListUsersController = new AdminListUsersController(adminListUsersUseCase);
  const adminGetUserByIdController = new AdminGetUserByIdController(
    adminGetUserByIdUseCase,
  );
  const adminUpdateUserController = new AdminUpdateUserController(
    adminGetUserByIdUseCase,
    adminUpdateUserUseCase,
  );

  app.register(
    async (usersApp) => {
      registerUsersRoutes(usersApp, {
        getMeController,
        updateMeController,
        updateSettingsController,
        getMyCampaignOverviewController,
        getMyInvitationsController,
        adminListUsersController,
        adminGetUserByIdController,
        adminUpdateUserController,
      });
    },
    { prefix: USERS_HTTP_PREFIX },
  );
}

export const usersModule: AppModule = {
  name: "users",
  dependencies: ["system", "auth"],
  register: registerUsersModule,
};
