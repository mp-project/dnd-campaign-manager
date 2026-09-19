import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  RequestRulesetListQuerySchema,
  RequestRulesetParamsSchema,
} from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { CreateRulesetSchema } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import { UpdateRulesetSchema } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import { DeleteRulesetSchema } from "#src/modules/ruleset/domain/dto/DeleteRulesetDto";
import {
  ResponseRulesetListSchema,
  ResponseRulesetSchema,
  ResponseValidateRulesetSchema,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import {
  RULESET_HTTP_PERMISSIONS,
  RULESET_HTTP_PATHS,
  RULESET_HTTP_RATE_LIMITS,
  RULESET_HTTP_SECURITY,
} from "#src/modules/ruleset/config/RulesetHttpConfig";
import { CreateRulesetController } from "#src/modules/ruleset/http/controller/CreateRulesetController";
import { DeleteRulesetController } from "#src/modules/ruleset/http/controller/DeleteRulesetController";
import { GetRulesetByIdController } from "#src/modules/ruleset/http/controller/GetRulesetByIdController";
import { ListRulesetsController } from "#src/modules/ruleset/http/controller/ListRulesetsController";
import { UpdateRulesetController } from "#src/modules/ruleset/http/controller/UpdateRulesetController";
import { ValidateRulesetController } from "#src/modules/ruleset/http/controller/ValidateRulesetController";

export type RulesetRouteControllers = {
  listRulesetsController: ListRulesetsController;
  getRulesetByIdController: GetRulesetByIdController;
  createRulesetController: CreateRulesetController;
  updateRulesetController: UpdateRulesetController;
  deleteRulesetController: DeleteRulesetController;
  validateRulesetController: ValidateRulesetController;
};

export function registerRulesetRoutes(
  app: FastifyInstance,
  controllers: RulesetRouteControllers,
): void {
  app.get(
    RULESET_HTTP_PATHS.collection,
    {
      config: {
        rateLimit: RULESET_HTTP_RATE_LIMITS.read,
        permission: {
          key: RULESET_HTTP_PERMISSIONS.list,
        },
      },
      schema: {
        tags: ["Rulesets"],
        operationId: "listRulesets",
        security: RULESET_HTTP_SECURITY,
        querystring: RequestRulesetListQuerySchema,
        response: {
          200: ResponseRulesetListSchema,
          400: errorResponseDto,
          401: errorResponseDto,
        },
      },
    },
    controllers.listRulesetsController.handle,
  );

  app.get(
    RULESET_HTTP_PATHS.item,
    {
      config: {
        rateLimit: RULESET_HTTP_RATE_LIMITS.read,
        permission: {
          key: RULESET_HTTP_PERMISSIONS.getById,
        },
      },
      schema: {
        tags: ["Rulesets"],
        operationId: "getRulesetById",
        security: RULESET_HTTP_SECURITY,
        params: RequestRulesetParamsSchema,
        response: {
          200: ResponseRulesetSchema,
          401: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getRulesetByIdController.handle,
  );

  app.post(
    RULESET_HTTP_PATHS.collection,
    {
      config: {
        rateLimit: RULESET_HTTP_RATE_LIMITS.write,
        permission: {
          key: RULESET_HTTP_PERMISSIONS.create,
        },
      },
      schema: {
        tags: ["Rulesets"],
        operationId: "createRuleset",
        security: RULESET_HTTP_SECURITY,
        body: CreateRulesetSchema,
        response: {
          201: ResponseRulesetSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.createRulesetController.handle,
  );

  app.patch(
    RULESET_HTTP_PATHS.item,
    {
      config: {
        rateLimit: RULESET_HTTP_RATE_LIMITS.write,
        permission: {
          key: RULESET_HTTP_PERMISSIONS.update,
        },
      },
      schema: {
        tags: ["Rulesets"],
        operationId: "updateRuleset",
        security: RULESET_HTTP_SECURITY,
        params: RequestRulesetParamsSchema,
        body: UpdateRulesetSchema,
        response: {
          200: ResponseRulesetSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.updateRulesetController.handle,
  );

  app.delete(
    RULESET_HTTP_PATHS.item,
    {
      config: {
        rateLimit: RULESET_HTTP_RATE_LIMITS.write,
        permission: {
          key: RULESET_HTTP_PERMISSIONS.delete,
        },
      },
      schema: {
        tags: ["Rulesets"],
        operationId: "deleteRuleset",
        security: RULESET_HTTP_SECURITY,
        params: DeleteRulesetSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.deleteRulesetController.handle,
  );

  app.post(
    RULESET_HTTP_PATHS.validate,
    {
      config: {
        rateLimit: RULESET_HTTP_RATE_LIMITS.write,
        permission: {
          key: RULESET_HTTP_PERMISSIONS.validate,
        },
      },
      schema: {
        tags: ["Rulesets"],
        operationId: "validateRuleset",
        security: RULESET_HTTP_SECURITY,
        params: RequestRulesetParamsSchema,
        response: {
          200: ResponseValidateRulesetSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.validateRulesetController.handle,
  );
}
