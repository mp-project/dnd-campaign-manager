import type { FastifyInstance } from "fastify";

import type { AppContainer } from "./container.js";

export type AppModule = {
  name: string;
  dependencies: readonly string[];
  register: (
    app: FastifyInstance,
    container: AppContainer,
  ) => Promise<void> | void;
  permissions?: readonly unknown[];
  relations?: readonly unknown[];
  usageProviders?: readonly unknown[];
  sessionProviders?: readonly unknown[];
};

export type ModuleRegistrationErrorCode =
  | "DUPLICATE_MODULE"
  | "MISSING_DEPENDENCY"
  | "CYCLIC_DEPENDENCY";

export class AppModuleRegistrationError extends Error {
  readonly code: ModuleRegistrationErrorCode;

  constructor(code: ModuleRegistrationErrorCode, message: string) {
    super(message);
    this.name = "AppModuleRegistrationError";
    this.code = code;
  }
}

export function resolveModuleRegistrationOrder(
  modules: readonly AppModule[],
): AppModule[] {
  const moduleByName = new Map<string, AppModule>();

  for (const module of modules) {
    if (moduleByName.has(module.name)) {
      throw new AppModuleRegistrationError(
        "DUPLICATE_MODULE",
        `Module '${module.name}' is already registered`,
      );
    }

    moduleByName.set(module.name, module);
  }

  for (const module of modules) {
    for (const dependencyName of module.dependencies) {
      if (!moduleByName.has(dependencyName)) {
        throw new AppModuleRegistrationError(
          "MISSING_DEPENDENCY",
          `Module '${module.name}' depends on missing module '${dependencyName}'`,
        );
      }
    }
  }

  const stateByModule = new Map<string, "unvisited" | "visiting" | "visited">(
    modules.map((module) => [module.name, "unvisited"]),
  );
  const orderedModules: AppModule[] = [];

  const visit = (moduleName: string, stack: string[]): void => {
    const moduleState = stateByModule.get(moduleName);

    if (moduleState === "visiting") {
      const cycleStart = stack.indexOf(moduleName);
      const cyclePath = [...stack.slice(cycleStart), moduleName].join(" -> ");

      throw new AppModuleRegistrationError(
        "CYCLIC_DEPENDENCY",
        `Circular module dependency detected: ${cyclePath}`,
      );
    }

    if (moduleState === "visited") {
      return;
    }

    stateByModule.set(moduleName, "visiting");
    const module = moduleByName.get(moduleName);

    if (!module) {
      throw new AppModuleRegistrationError(
        "MISSING_DEPENDENCY",
        `Module '${moduleName}' is missing`,
      );
    }

    for (const dependencyName of module.dependencies) {
      visit(dependencyName, [...stack, moduleName]);
    }

    stateByModule.set(moduleName, "visited");
    orderedModules.push(module);
  };

  for (const module of modules) {
    visit(module.name, []);
  }

  return orderedModules;
}

export async function registerModules(
  app: FastifyInstance,
  container: AppContainer,
  modules: readonly AppModule[],
): Promise<AppModule[]> {
  const orderedModules = resolveModuleRegistrationOrder(modules);

  for (const module of orderedModules) {
    await module.register(app, container);
  }

  return orderedModules;
}
