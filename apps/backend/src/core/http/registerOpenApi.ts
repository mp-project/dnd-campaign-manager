import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { jsonSchemaTransform, jsonSchemaTransformObject } from "fastify-type-provider-zod";

export function registerOpenApi(app: FastifyInstance): void {
  app.register(swagger, {
    openapi: {
      info: {
        title: "Questaria API",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          // The Clerk session token of the signed-in browser.
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    // Writes the shared schemas the routes refer to (`#/components/schemas/…`) into the document.
    transformObject: jsonSchemaTransformObject,
  });

  app.register(swaggerUI, {
    routePrefix: "/documentation",
  });
}
