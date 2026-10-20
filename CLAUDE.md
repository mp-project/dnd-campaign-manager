# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

npm-workspaces monorepo (Node `>=24 <25`, ESM) for a D&D campaign manager:

- `apps/backend` (`@dnd/backend`): Fastify 5 + Zod (`fastify-type-provider-zod`) + Drizzle ORM on PostgreSQL. Almost all real logic lives here.
- `apps/frontend` (`@dnd/frontend`): Vue 3 + Vite + Pinia + Tailwind. Still mostly scaffolding (layouts/pages plus `features/campaigns`).
- `packages/test-utils`: shared test helpers.
- `tests/e2e`: Playwright smoke tests (root `playwright.config.ts`).

## Commands

Run from the repo root unless noted.

```bash
npm run dev               # backend (tsx watch) + frontend (vite) together
npm run lint              # eslint over the whole repo
npm run typecheck         # tsc / vue-tsc in every workspace
npm run build
npm run test:unit         # backend jest "unit" project
npm run test:integration  # backend jest "integration" project (needs test DB, runs in band)
npm run test:integration:docker   # integration tests fully inside compose (profile "test")
npm run test:e2e          # build + playwright
```

Single test (Jest, from root):

```bash
npm run test:unit --workspace @dnd/backend -- tests/unit/campaigns.service.test.ts
npm run test:unit --workspace @dnd/backend -- -t "registers module dependencies"
npm run test:integration --workspace @dnd/backend -- tests/integration/campaigns.http.test.ts
```

CI (`.github/workflows/ci.yml`) runs: `lint` → `typecheck` → `test:unit` → `db:migrate` → `test:integration` → `build`.

### Database

```bash
npm run db:generate       # drizzle-kit generate a migration from schema changes
npm run db:migrate        # apply migrations (drizzle-kit migrate)
npm run db:seed           # bootstrap + ruleset seed data (apps/backend/scripts/seed.ts)
docker compose --profile development up -d db adminer   # local DB + Adminer
docker compose --profile test up -d db-test             # integration-test DB on 127.0.0.1:55433 (tmpfs)
```

- Drizzle schema entrypoint is `apps/backend/src/core/db/schema.ts`, which re-exports `src/core/db/schemas/index.ts`. **Each module's table file must be exported from `schemas/index.ts`** or drizzle-kit won't see it.
- Migrations live in `apps/backend/drizzle/migrations` (SQL + `meta/` snapshots, generated). Generated SQL has needed hand fixes before (e.g. enum replacement with dependent indexes/defaults, parenthesized defaults); review it and keep schema, SQL and snapshot consistent.
- Integration tests drop and recreate the `public` and `drizzle` schemas and rerun migrations **before every test** (`tests/setup/integration.ts`). `assertSafeTestDatabaseUrl` refuses to run unless the host is local/`db-test` and the DB name contains `test`. `TEST_DATABASE_URL` defaults to `postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test` (`tests/setup/env.ts`).

## Environment

- Three env files: root `.env` (shared compose values), `apps/backend/.env`, `apps/frontend/.env`, each created from its `.env.example`.
- `APP_ENV` (development | stage | production) drives compose profile and `NODE_ENV`. Precedence: `COMPOSE_PROFILES` → `APP_ENV` → `production`; `NODE_ENV` → `APP_ENV` → `production`.
- `docker compose --profile development up --build` adds RustFS (S3-compatible storage), Mailpit (SMTP + inbox UI) and Adminer. Caddy is the TLS ingress: `https://api.localhost:8443`, `https://app.localhost:8443`.
- Local dev URLs: API `http://api.localhost:3000/api/v1`, frontend `http://app.localhost:5173/`.

## Backend architecture

### Import aliases

The backend uses Node subpath imports (`apps/backend/package.json` `imports`): `#core/*` → `src/core/*`, `#src/*` → `src/*`, `#test/*` → `tests/*`. They resolve to `.ts` sources under the `development` condition (set via `NODE_OPTIONS=--conditions=development` in `dev`/`db:seed`) and to `dist/*.js` otherwise. Jest mirrors them via `moduleNameMapper`. Use these aliases instead of relative paths in module code.

### App bootstrap

`src/app.ts` `buildApp()` builds the Fastify instance with Zod validator/serializer, creates the `AppContainer` (`src/core/app/container.ts`), registers core plugins (security, JWT auth, request context, campaign context, authorization, error handler, OpenAPI, health routes) and then mounts all modules under `API_BASE_PATH = /api/v1`. `buildApp` accepts overrides for `env`, `pool`, `modules` and `publicPorts`, which is how tests inject fakes (`tests/helpers/buildTestApp.ts`).

### Module system

- Modules are `AppModule` objects `{ name, dependencies, register(app, container) }` (`src/core/app/moduleSystem.ts`). They are listed in `src/modules/index.ts` (`defaultAppModules`) and registered in topologically sorted order; duplicates, missing deps and cycles throw `AppModuleRegistrationError`.
- Each module's wiring lives in `src/modules/<name>/Setup.ts` and is re-exported from its `index.ts`. `Setup.ts` manually constructs repository → service → use cases → controllers, then mounts routes with `app.register(..., { prefix })`.
- **Cross-module access goes through the container's dependency registry**, not direct imports of another module's internals: a module publishes `container.dependencies.set(<MODULE>_MODULE_DEPENDENCIES, {...})` (a string token plus exported type), and dependents read it with `container.dependencies.get/require`. The dependency must also be declared in `dependencies` so it registers first. `tests/unit/*.moduleDependencies.test.ts` covers this per module.
- Shared infrastructure is exposed as **ports** on `container.ports`: `permissionService`, `campaignFactPort`, `storagePort` (local / S3 / in-memory), `emailPort` (SMTP / noop). Modules may wrap ports (e.g. campaigns fills in `campaignFactPort.resolveCampaignAccess`).

### Module layout and request flow

Typical module folders: `config/` (`*HttpConfig.ts`: prefix, paths, permission keys, rate limits, security), `domain/dto` (Zod schemas), `domain/entities` (Drizzle tables), `domain/repository`, `service/`, `useCase/`, `http/controller`, `http/routes/v1`, `permissions/`, optionally `helpers/Audit.ts`, `email/`, `policies/`.

Flow: route (Zod `schema` + `config.permission` + `config.rateLimit`) → controller (extends `AbstractController`, wraps work in `this.execute(...)`, which maps `ZodError` → `ValidationError` and unknown errors → `InternalError`) → use case (one class per operation, `execute(context, ...)`) → service (holds `db`, `transactionManager`, repository) → repository (Drizzle queries, takes the db/tx handle as first arg). Response mappers in `http/controller/*ResponseMapper.ts` shape output DTOs.

### Auth, permissions, campaign context

- JWT access tokens carry `sub` (actor id) and `systemRole`; request context is on `request.requestContext`.
- Routes declare `config.permission = { key, hideAsNotFoundForPlayers? }`; the authorization `preHandler` (`src/core/http/authorization.ts`) calls `permissionService.require` against `request.campaignContext`, falling back to a `"global"` context.
- `request.campaignContext` is resolved from a `:campaignId` route param or an `x-campaign-id` header via `campaignFactPort.resolveCampaignAccess`.
- Adding a permission: define keys + `PermissionDefinition`s in the module's `permissions/`, register them in `Setup.ts` (`permissionService.registerDefinitions`), and add keys to the aggregation in `src/modules/auth/permissions/permissions.ts` (`ALL_PERMISSIONS`, `APPLICATION_USER_PERMISSIONS`). System role → permission mapping is in `src/modules/auth/permissions/roles.ts`.
- Campaign-scoped updates use optimistic locking (`src/core/db/optimisticLock.ts`, `version` column, `VersionConflictError` → HTTP 412).

### Errors

Throw subclasses of `AppError` / the HTTP errors in `src/core/error/http/` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, ...). `registerErrorHandler` plus `errorMapper` turn them into the standard error payload. Modules add their own under `error/http/` when needed.

### Tests

- `apps/backend/tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts` are separate Jest projects (SWC transform, `maxWorkers: 1`). `tests/unit/http.validation.test.ts` uses snapshots.
- Integration HTTP tests use `buildTestApp` with signed test JWTs and `app.inject`; `tests/helpers/factories.ts` and `deterministic.ts` give fixtures.

## Notes

- `copilot-docs/` is gitignored, older reference material (it calls the wiring file `setup.ts`; the real convention is `Setup.ts`). Its `module-setup.md` describes the module checklist used above.
