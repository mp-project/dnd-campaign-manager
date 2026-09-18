import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import {
  AppModuleRegistrationError,
  registerModules,
  resolveModuleRegistrationOrder,
  type AppModule,
} from "#core/app/module-system";

describe("module registration", () => {
  it("registers modules in topological dependency order", async () => {
    const calls: string[] = [];
    const modules: readonly AppModule[] = [
      {
        name: "notes",
        dependencies: ["users", "campaigns"],
        register: async () => {
          calls.push("notes");
        },
      },
      {
        name: "users",
        dependencies: [],
        register: async () => {
          calls.push("users");
        },
      },
      {
        name: "campaigns",
        dependencies: ["users"],
        register: async () => {
          calls.push("campaigns");
        },
      },
    ];

    const orderedModules = await registerModules(
      {} as FastifyInstance,
      {} as AppContainer,
      modules,
    );

    expect(orderedModules.map((module) => module.name)).toEqual([
      "users",
      "campaigns",
      "notes",
    ]);
    expect(calls).toEqual(["users", "campaigns", "notes"]);
  });

  it("throws on duplicate module names", () => {
    const modules: readonly AppModule[] = [
      {
        name: "users",
        dependencies: [],
        register: async () => {},
      },
      {
        name: "users",
        dependencies: [],
        register: async () => {},
      },
    ];

    expect(() => resolveModuleRegistrationOrder(modules)).toThrow(
      AppModuleRegistrationError,
    );

    try {
      resolveModuleRegistrationOrder(modules);
    } catch (error) {
      expect((error as AppModuleRegistrationError).code).toBe("DUPLICATE_MODULE");
    }
  });

  it("throws on missing dependency", () => {
    const modules: readonly AppModule[] = [
      {
        name: "notes",
        dependencies: ["campaigns"],
        register: async () => {},
      },
    ];

    expect(() => resolveModuleRegistrationOrder(modules)).toThrow(
      AppModuleRegistrationError,
    );

    try {
      resolveModuleRegistrationOrder(modules);
    } catch (error) {
      expect((error as AppModuleRegistrationError).code).toBe("MISSING_DEPENDENCY");
    }
  });

  it("throws on circular dependencies", () => {
    const modules: readonly AppModule[] = [
      {
        name: "users",
        dependencies: ["campaigns"],
        register: async () => {},
      },
      {
        name: "campaigns",
        dependencies: ["notes"],
        register: async () => {},
      },
      {
        name: "notes",
        dependencies: ["users"],
        register: async () => {},
      },
    ];

    expect(() => resolveModuleRegistrationOrder(modules)).toThrow(
      AppModuleRegistrationError,
    );

    try {
      resolveModuleRegistrationOrder(modules);
    } catch (error) {
      expect((error as AppModuleRegistrationError).code).toBe("CYCLIC_DEPENDENCY");
    }
  });
});
