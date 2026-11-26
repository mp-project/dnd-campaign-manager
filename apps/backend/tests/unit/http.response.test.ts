import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { z } from "zod";

import { AbstractController } from "#core/http/controller/AbstractController";
import { sendHttpResponse } from "#core/http/httpResponse";

class ExampleController extends AbstractController {
  list = async () => this.execute(async () => this.ok({ items: [] }, { "cache-control": "no-store" }));
  create = async () => this.execute(async () => this.created({ id: "n1" }, "/notes/n1"));
  createWithoutLocation = async () => this.execute(async () => this.created({ id: "n2" }));
  queue = async () => this.execute(async () => this.accepted({ queued: true }));
  remove = async () => this.execute(async () => this.noContent());
}

describe("controller answers", () => {
  const controller = new ExampleController();
  const app = Fastify();

  app.get("/ok", async (_request, reply) => sendHttpResponse(reply, await controller.list()));
  app.post("/created", async (_request, reply) => sendHttpResponse(reply, await controller.create()));
  app.post("/created-plain", async (_request, reply) =>
    sendHttpResponse(reply, await controller.createWithoutLocation()),
  );
  app.post("/accepted", async (_request, reply) => sendHttpResponse(reply, await controller.queue()));
  app.delete("/no-content", async (_request, reply) => sendHttpResponse(reply, await controller.remove()));

  afterAll(async () => {
    await app.close();
  });

  it("sends 200 with body and headers", async () => {
    const response = await app.inject({ method: "GET", url: "/ok" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("sends 201 with the location of the new resource", async () => {
    const response = await app.inject({ method: "POST", url: "/created" });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "n1" });
    expect(response.headers.location).toBe("/notes/n1");
  });

  it("sends 201 without a location header when none is given", async () => {
    const response = await app.inject({ method: "POST", url: "/created-plain" });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBeUndefined();
  });

  it("sends 202 with body", async () => {
    const response = await app.inject({ method: "POST", url: "/accepted" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ queued: true });
  });

  it("sends 204 without a body", async () => {
    const response = await app.inject({ method: "DELETE", url: "/no-content" });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});

describe("controller answers with the Zod serializer", () => {
  class SchemaController extends AbstractController {
    create = async (data: unknown) => this.execute(async () => this.created(data));
    remove = async () => this.execute(async () => this.noContent());
  }

  const controller = new SchemaController();
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const responses = {
    200: z.object({ kind: z.literal("ok") }),
    201: z.object({ id: z.string() }),
  };

  app.post(
    "/items",
    { schema: { body: z.object({ id: z.unknown() }), response: responses } },
    async (request, reply) =>
      sendHttpResponse(reply, await controller.create({ ...(request.body as object), extra: true })),
  );
  app.delete("/items", { schema: { response: { 204: z.null() } } }, async (_request, reply) =>
    sendHttpResponse(reply, await controller.remove()),
  );

  afterAll(async () => {
    await app.close();
  });

  it("serializes with the schema of the controller's status and strips unknown fields", async () => {
    const response = await app.inject({ method: "POST", url: "/items", payload: { id: "n1" } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "n1" });
  });

  it("refuses a body that doesn't fit the schema of its status", async () => {
    const response = await app.inject({ method: "POST", url: "/items", payload: { id: 42 } });

    expect(response.statusCode).toBe(500);
  });

  it("sends 204 without a body on a route that declares a 204 schema", async () => {
    const response = await app.inject({ method: "DELETE", url: "/items" });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});
