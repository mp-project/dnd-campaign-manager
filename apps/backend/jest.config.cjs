const transform = {
  "^.+\\.ts$": [
    "@swc/jest",
    {
      sourceMaps: "inline",
      module: {
        type: "commonjs",
      },
      jsc: {
        target: "es2022",
        parser: {
          syntax: "typescript",
        },
      },
    },
  ],
};

module.exports = {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
      transform,
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
      setupFiles: ["<rootDir>/tests/setup/env.ts"],
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      transform,
      moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
      setupFiles: ["<rootDir>/tests/setup/env.ts"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/integration.ts"],
    },
  ],
};
