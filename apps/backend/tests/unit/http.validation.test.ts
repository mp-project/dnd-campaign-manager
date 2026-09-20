import { randomUUID } from "node:crypto";
import { z } from "zod";

import { buildApp } from "#src/app";
import type { AppModule } from "#core/app/moduleSystem";
import { ForbiddenError } from "#core/http/domainErrors";
import {
  baseEntityResponseDto,
  expectedVersionDto,
  nonEmptyPatch,
  paginationDto,
  slugDto,
  sortDto,
  standardListResponseDto,
  uuidDto,
} from "#core/http/dto";
import {
  createStandardListResponse,
  decodePaginationCursor,
  encodePaginationCursor,
} from "#core/http/listResponse";
import { createTestEnv } from "#test/helpers/testEnv";

const listItemDto = baseEntityResponseDto.extend({
  slug: slugDto,
});

const createValidationItemBodyDto = z
  .strictObject({
    slug: slugDto,
    scheduledAt: z.coerce.date(),
  })
  .merge(expectedVersionDto);

const updateValidationItemBodyDto = nonEmptyPatch({
  slug: slugDto,
  scheduledAt: z.coerce.date(),
});

const validationModule: AppModule = {
  name: "validation-tests",
  dependencies: [],
  register: async (app) => {
    app.get(
      "/validation/items",
      {
        schema: {
          tags: ["Validation"],
          security: [{ bearerAuth: [] }],
          operationId: "listValidationItems",
          querystring: paginationDto.merge(sortDto),
          response: {
            200: standardListResponseDto(listItemDto),
          },
        },
      },
      async (request) => {
        const query = request.query as z.infer<typeof paginationDto> &
          z.infer<typeof sortDto>;
        const id = "11111111-1111-4111-8111-111111111111";
        const cursor = encodePaginationCursor({
          sortValue: `${query.sortBy}:${query.sortDirection}`,
          id,
        });

        return createStandardListResponse({
          data: [
            {
              id,
              version: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              deletedAt: null,
              createdBy: "11111111-1111-4111-8111-111111111111",
              updatedBy: null,
              slug: "example-item",
            },
          ],
          limit: query.limit,
          nextCursor: cursor,
          total: 1,
        });
      },
    );

    app.post(
      "/validation/items/:id",
      {
        schema: {
          tags: ["Validation"],
          security: [{ bearerAuth: [] }],
          operationId: "createValidationItem",
          params: z.strictObject({
            id: uuidDto,
          }),
          body: createValidationItemBodyDto,
          response: {
            200: listItemDto,
          },
        },
      },
      async (request) => {
        const params = request.params as { id: string };
        const body = request.body as z.infer<typeof createValidationItemBodyDto>;

        return {
          id: params.id,
          version: body.expectedVersion,
          createdAt: body.scheduledAt.toISOString(),
          updatedAt: body.scheduledAt.toISOString(),
          deletedAt: null,
          createdBy: "11111111-1111-4111-8111-111111111111",
          updatedBy: null,
          slug: body.slug,
        };
      },
    );

    app.patch(
      "/validation/items/:id",
      {
        schema: {
          tags: ["Validation"],
          security: [{ bearerAuth: [] }],
          operationId: "updateValidationItem",
          params: z.strictObject({
            id: uuidDto,
          }),
          body: updateValidationItemBodyDto,
          response: {
            204: z.null(),
          },
        },
      },
      async (_request, reply) => {
        return reply.code(204).send();
      },
    );

    app.get("/validation/error/forbidden", async () => {
      throw new ForbiddenError("Missing permission");
    });

    app.get("/validation/error/internal", async () => {
      throw new Error("Sensitive stack details");
    });

    app.get("/validation/error/rate-limited", async () => {
      const error = new Error("Too many requests") as Error & {
        statusCode?: number;
        code?: string;
      };
      error.statusCode = 429;
      error.code = "FST_ERR_RATE_LIMIT";
      throw error;
    });
  },
};

function createValidationApp(nodeEnv: "test" | "production" = "test") {
  return buildApp({
    env: createTestEnv({ NODE_ENV: nodeEnv, LOG_LEVEL: "warn" }),
    modules: [validationModule],
    readyProbe: async () => ({ database: true, migrations: true }),
  });
}

describe("http validation and error contracts", () => {
  it("coerces params/query/body with zod schemas", async () => {
    const app = createValidationApp();
    const id = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/validation/items/${id}`,
      payload: {
        slug: "arcane-mage",
        scheduledAt: "2026-07-01T09:15:00.000Z",
        expectedVersion: "2",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      version: 2,
      slug: "arcane-mage",
    });

    await app.close();
  });

  it("rejects unknown body fields and keeps request id in payload", async () => {
    const app = createValidationApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/validation/items/${randomUUID()}`,
      payload: {
        slug: "arcane-mage",
        scheduledAt: "2026-07-01T09:15:00.000Z",
        expectedVersion: 2,
        unknownField: "blocked",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });
    expect(response.json().error.requestId).toBeTruthy();

    await app.close();
  });

  it("rejects empty patch payload", async () => {
    const app = createValidationApp();
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/validation/items/${randomUUID()}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
      },
    });

    await app.close();
  });

  it("validates uuid, date and pagination limits", async () => {
    const app = createValidationApp();

    const invalidUuidResponse = await app.inject({
      method: "POST",
      url: "/api/v1/validation/items/not-a-uuid",
      payload: {
        slug: "valid-slug",
        scheduledAt: "2026-07-01T09:15:00.000Z",
        expectedVersion: 1,
      },
    });

    const invalidDateResponse = await app.inject({
      method: "POST",
      url: `/api/v1/validation/items/${randomUUID()}`,
      payload: {
        slug: "valid-slug",
        scheduledAt: "invalid-date",
        expectedVersion: 1,
      },
    });

    const invalidPaginationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/validation/items?limit=101",
    });

    expect(invalidUuidResponse.statusCode).toBe(400);
    expect(invalidDateResponse.statusCode).toBe(400);
    expect(invalidPaginationResponse.statusCode).toBe(400);

    await app.close();
  });

  it("returns standard list response with stable cursor from sort key and uuid", async () => {
    const app = createValidationApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/validation/items?limit=1&sortBy=createdAt&sortDirection=asc",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "example-item",
        },
      ],
      pageInfo: {
        limit: 1,
      },
    });

    const parsedBody = response.json() as {
      pageInfo: {
        nextCursor: string | null;
      };
    };
    expect(parsedBody.pageInfo.nextCursor).toBeTruthy();

    const decodedCursor = decodePaginationCursor(parsedBody.pageInfo.nextCursor ?? "");
    expect(decodedCursor).toEqual({
      sortValue: "createdAt:asc",
      id: "11111111-1111-4111-8111-111111111111",
    });

    await app.close();
  });

  it("maps domain and rate-limit errors to unified codes", async () => {
    const app = createValidationApp();

    const forbiddenResponse = await app.inject({
      method: "GET",
      url: "/api/v1/validation/error/forbidden",
    });
    const rateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/validation/error/rate-limited",
    });

    expect(forbiddenResponse.statusCode).toBe(403);
    expect(forbiddenResponse.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
      },
    });

    expect(rateLimitedResponse.statusCode).toBe(429);
    expect(rateLimitedResponse.json()).toMatchObject({
      error: {
        code: "RATE_LIMITED",
      },
    });

    await app.close();
  });

  it("masks internal errors in production", async () => {
    const app = createValidationApp("production");
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/validation/error/internal",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: null,
      },
    });

    await app.close();
  });

  it("exposes operation metadata and security schemes in OpenAPI", async () => {
    const app = createValidationApp();
    const response = await app.inject({
      method: "GET",
      url: "/documentation/json",
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json() as {
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
      paths?: Record<string, Record<string, { operationId?: string }>>;
    };

    expect({
      securitySchemes: spec.components?.securitySchemes,
      operationIds: {
        health: spec.paths?.["/health"]?.get?.operationId,
        readiness: spec.paths?.["/ready"]?.get?.operationId,
        apiBase: spec.paths?.["/api/v1/"]?.get?.operationId,
        listValidationItems:
          spec.paths?.["/api/v1/validation/items"]?.get?.operationId,
      },
    }).toMatchSnapshot();

    await app.close();
  });
});