import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { USERS_HTTP_PREFIX } from "#src/modules/users/config/UsersHttpConfig";
import { UsersRepository } from "#src/modules/users/domain/repository/UsersRepository";
import { AdminGetUserByIdController } from "#src/modules/users/http/controller/AdminGetUserByIdController";
import { AdminListUsersController } from "#src/modules/users/http/controller/AdminListUsersController";
import { AdminUpdateUserController } from "#src/modules/users/http/controller/AdminUpdateUserController";
import { GetEmailVerificationStatusController } from "#src/modules/users/http/controller/GetEmailVerificationStatusController";
import { GetMeController } from "#src/modules/users/http/controller/GetMeController";
import { GetMyCampaignOverviewController } from "#src/modules/users/http/controller/GetMyCampaignOverviewController";
import { GetMyInvitationsController } from "#src/modules/users/http/controller/GetMyInvitationsController";
import { RegisterUserController } from "#src/modules/users/http/controller/RegisterUserController";
import { RequestEmailVerificationController } from "#src/modules/users/http/controller/RequestEmailVerificationController";
import { VerifyEmailVerificationController } from "#src/modules/users/http/controller/VerifyEmailVerificationController";
import { UpdateMeController } from "#src/modules/users/http/controller/UpdateMeController";
import { UpdateSettingsController } from "#src/modules/users/http/controller/UpdateSettingsController";
import { registerUsersRoutes } from "#src/modules/users/http/routes/v1/UsersRoutes";
import { usersPermissionDefinitions } from "#src/modules/users/permissions/UsersPermissions";
import { UsersService } from "#src/modules/users/service/UsersService";
import { AdminGetUserByIdUseCase } from "#src/modules/users/useCase/AdminGetUserByIdUseCase";
import { AdminListUsersUseCase } from "#src/modules/users/useCase/AdminListUsersUseCase";
import { AdminUpdateUserUseCase } from "#src/modules/users/useCase/AdminUpdateUserUseCase";
import { GetEmailVerificationStatusUseCase } from "#src/modules/users/useCase/GetEmailVerificationStatusUseCase";
import { GetMeUseCase } from "#src/modules/users/useCase/GetMeUseCase";
import { GetMyCampaignOverviewUseCase } from "#src/modules/users/useCase/GetMyCampaignOverviewUseCase";
import { GetMyInvitationsUseCase } from "#src/modules/users/useCase/GetMyInvitationsUseCase";
import { RegisterUserUseCase } from "#src/modules/users/useCase/RegisterUserUseCase";
import { RequestEmailVerificationUseCase } from "#src/modules/users/useCase/RequestEmailVerificationUseCase";
import { VerifyEmailVerificationUseCase } from "#src/modules/users/useCase/VerifyEmailVerificationUseCase";
import { UpdateMeUseCase } from "#src/modules/users/useCase/UpdateMeUseCase";
import { UpdateSettingsUseCase } from "#src/modules/users/useCase/UpdateSettingsUseCase";

export const AUTH_SESSION_DEPENDENCIES = "auth.session.dependencies";
export const USERS_MODULE_DEPENDENCIES = "users.module.dependencies";

export type AuthSessionDependencies = {
  revokeRefreshTokensForUser(userId: string): Promise<void>;
};

export type UsersModuleDependencies = {
  repository: UsersRepository;
  service: UsersService;
  useCases: {
    getMe: GetMeUseCase;
    updateMe: UpdateMeUseCase;
    updateSettings: UpdateSettingsUseCase;
    getMyCampaignOverview: GetMyCampaignOverviewUseCase;
    getMyInvitations: GetMyInvitationsUseCase;
    requestEmailVerification: RequestEmailVerificationUseCase;
    getEmailVerificationStatus: GetEmailVerificationStatusUseCase;
    registerUser: RegisterUserUseCase;
    verifyEmailVerification: VerifyEmailVerificationUseCase;
    adminListUsers: AdminListUsersUseCase;
    adminGetUserById: AdminGetUserByIdUseCase;
    adminUpdateUser: AdminUpdateUserUseCase;
  };
};

async function registerUsersModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  const repository = new UsersRepository();
  const authSessionDependencies =
    container.dependencies.get<AuthSessionDependencies>(AUTH_SESSION_DEPENDENCIES);
  const service = new UsersService(
    container.db,
    container.transactionManager,
    repository,
    container.ports.permissionService,
    authSessionDependencies,
    container.ports.emailPort,
    container.config.EMAIL_VERIFICATION_SECRET ?? container.config.JWT_ACCESS_SECRET,
    container.config.EMAIL_VERIFICATION_CODE_TTL_HOURS,
  );

  const getMeUseCase = new GetMeUseCase(service);
  const updateMeUseCase = new UpdateMeUseCase(service);
  const updateSettingsUseCase = new UpdateSettingsUseCase(service);
  const getMyCampaignOverviewUseCase = new GetMyCampaignOverviewUseCase(service);
  const getMyInvitationsUseCase = new GetMyInvitationsUseCase(service);
  const requestEmailVerificationUseCase = new RequestEmailVerificationUseCase(service);
  const getEmailVerificationStatusUseCase = new GetEmailVerificationStatusUseCase(
    service,
  );
  const registerUserUseCase = new RegisterUserUseCase(service);
  const verifyEmailVerificationUseCase = new VerifyEmailVerificationUseCase(service);
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
      requestEmailVerification: requestEmailVerificationUseCase,
      getEmailVerificationStatus: getEmailVerificationStatusUseCase,
      registerUser: registerUserUseCase,
      verifyEmailVerification: verifyEmailVerificationUseCase,
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
  const requestEmailVerificationController = new RequestEmailVerificationController(
    requestEmailVerificationUseCase,
  );
  const getEmailVerificationStatusController = new GetEmailVerificationStatusController(
    getEmailVerificationStatusUseCase,
  );
  const registerUserController = new RegisterUserController(registerUserUseCase);
  const verifyEmailVerificationController = new VerifyEmailVerificationController(
    verifyEmailVerificationUseCase,
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
        requestEmailVerificationController,
        getEmailVerificationStatusController,
        registerUserController,
        verifyEmailVerificationController,
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
  dependencies: ["system"],
  permissions: usersPermissionDefinitions,
  register: registerUsersModule,
};
