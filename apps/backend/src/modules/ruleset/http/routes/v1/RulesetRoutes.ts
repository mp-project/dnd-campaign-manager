import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  RequestRulesetListQuerySchema,
  RequestRulesetParamsSchema,
} from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { CreateRulesetSchema } from "#src/modules/ruleset/domain/dto/CreateRulesetDto";
import { UpdateRulesetSchema } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import {
  ResponseRulesetListSchema,
  ResponseRulesetSchema,
  ResponseValidateRulesetSchema,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import { RULESET_PERMISSIONS } from "#src/modules/ruleset/permissions/RulesetPermissions";
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

const tags = ["Rulesets"];
const security = [{ cookieAuth: [] }] as const;

export function registerRulesetRoutes(
  app: FastifyInstance,
  controllers: RulesetRouteControllers,
): void {
  app.get(
    "/ruleset",
    {
      config: {
        permission: { key: RULESET_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "listRulesets",
        security,
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
    "/ruleset/:rulesetId",
    {
      config: {
        permission: { key: RULESET_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "getRulesetById",
        security,
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
    "/ruleset",
    {
      config: {
        permission: { key: RULESET_PERMISSIONS.create },
      },
      schema: {
        tags,
        operationId: "createRuleset",
        security,
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
    async (request, reply) => {
      const created = await controllers.createRulesetController.handle(request);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/ruleset/:rulesetId",
    {
      config: {
        permission: { key: RULESET_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateRuleset",
        security,
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
    "/ruleset/:rulesetId",
    {
      config: {
        permission: { key: RULESET_PERMISSIONS.delete },
      },
      schema: {
        tags,
        operationId: "deleteRuleset",
        security,
        params: RequestRulesetParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.deleteRulesetController.handle(request);
      return reply.code(204).send();
    },
  );

  app.post(
    "/ruleset/:rulesetId/validate",
    {
      config: {
        permission: { key: RULESET_PERMISSIONS.validate },
      },
      schema: {
        tags,
        operationId: "validateRuleset",
        security,
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
