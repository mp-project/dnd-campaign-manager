import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

/**
 * Tracked tables are only written through the history, so no change can skip its entry.
 * `tests/unit/history.schema.test.ts` checks that this list matches what is registered.
 */
const TRACKED_TABLES = ["assetLinks", "assetMedia", "assets", "backgrounds", "campaignMemberships", "campaigns", "classes", "features", "feats", "itemInstanceKnowledge", "itemInstances", "items", "notes", "rulesets", "species", "speciesVariants", "spellLists", "spells", "subclasses", "tags", "users"];

function trackedWritesRule(tables) {
  return [
    "error",
    {
      selector: `CallExpression[callee.property.name=/^(insert|update|delete)$/][arguments.0.name=/^(${tables.join("|")})$/]`,
      message:
        "Tracked tables are written through the history: use `scope.create`, `scope.change` or `scope.softDelete`.",
    },
  ];
}

const tablesWithout = (table) => TRACKED_TABLES.filter((name) => name !== table);

export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/drizzle/meta/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,cjs,mjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["apps/backend/src/**/*.ts", "apps/backend/scripts/**/*.ts"],
    rules: {
      "no-restricted-syntax": trackedWritesRule(TRACKED_TABLES),
    },
  },
  {
    // Decided on purpose: the history of users only covers changes by administrators. `history`
    // depends on `auth`, and the own profile and login data have nothing worth restoring.
    files: [
      "apps/backend/src/modules/auth/domain/repository/AuthRepository.ts",
      "apps/backend/src/modules/users/domain/repository/UsersRepository.ts",
    ],
    rules: {
      "no-restricted-syntax": trackedWritesRule(tablesWithout("users")),
    },
  },
  {
    // Seed rows have no actor; they get their first version with the first change.
    files: ["apps/backend/scripts/seed/ruleset.seed.ts"],
    rules: {
      "no-restricted-syntax": trackedWritesRule(tablesWithout("rulesets")),
    },
  },
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: "module",
        ecmaVersion: "latest",
        extraFileExtensions: [".vue"],
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    rules: {
      "vue/singleline-html-element-content-newline": "off",
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "apps/backend/tests/**/*.ts",
      "tests/e2e/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
