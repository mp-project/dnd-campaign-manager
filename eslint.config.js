import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import vueI18n from "@intlify/eslint-plugin-vue-i18n";

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
      // Local only (gitignored): the clickdummy is a JavaScript reference, not part of the app.
      "clickdummy/**",
      // Generated from the backend OpenAPI document (npm run api:types).
      "apps/frontend/src/core/api/generated/**",
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
    // Service worker for Pusher Beams, served unbundled from public/.
    files: ["apps/frontend/public/service-worker.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.serviceworker,
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
    files: ["apps/backend/src/modules/ruleset/defaults/ensureDefaultRulesets.ts"],
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
    // Every text on screen comes from the message files (German and English).
    files: ["apps/frontend/src/**/*.vue"],
    plugins: { "@intlify/vue-i18n": vueI18n },
    rules: {
      // Server HTML only through SafeHtml (DOMPurify), the one place with an exception.
      "vue/no-v-html": "error",
      // Props are typed (defineProps<…>()), so optional ones need no runtime default.
      "vue/require-default-prop": "off",
      // Base components keep the clickdummy's names.
      "vue/multi-word-component-names": ["error", { ignores: ["Avatar", "Badge", "Icon"] }],
      "@intlify/vue-i18n/no-raw-text": [
        "error",
        { ignorePattern: "^[\\s\\d.,:;!?·…×+\\-–—/|()&%#*]+$" },
      ],
    },
  },
  {
    // Development-only showcase, never shipped.
    files: ["apps/frontend/src/dev/**/*.vue"],
    rules: { "@intlify/vue-i18n/no-raw-text": "off" },
  },
  {
    // Tests mount small helper components next to each other.
    files: ["apps/frontend/tests/**/*.ts"],
    rules: { "vue/one-component-per-file": "off" },
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
