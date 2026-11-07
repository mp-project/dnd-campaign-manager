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
docker compose --profile test up -d db-test rustfs-test # integration-test DB on 127.0.0.1:55433, S3 on 127.0.0.1:59000 (both tmpfs)
npm run storage:check --workspace @dnd/backend          # write, read and delete an object with the current env's storage settings
```

- Drizzle schema entrypoint is `apps/backend/src/core/db/schema.ts`, which re-exports `src/core/db/schemas/index.ts`. **Each module's table file must be exported from `schemas/index.ts`** or drizzle-kit won't see it.
- Migrations live in `apps/backend/drizzle/migrations` (SQL + `meta/` snapshots, generated). Generated SQL has needed hand fixes before (e.g. enum replacement with dependent indexes/defaults, parenthesized defaults); review it and keep schema, SQL and snapshot consistent.
- Integration tests need `db-test` and `rustfs-test`: `tests/integration/storage.s3.test.ts` and `media.s3.http.test.ts` run against a real S3, each with its own bucket. All other tests use `InMemoryStorage`, which can't show S3 problems.
- Integration tests drop and recreate the `public` and `drizzle` schemas and rerun migrations **before every test** (`tests/setup/integration.ts`). `assertSafeTestDatabaseUrl` refuses to run unless the host is local/`db-test` and the DB name contains `test`. `TEST_DATABASE_URL` defaults to `postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test` (`tests/setup/env.ts`).

## Environment

- Three env files: root `.env` (shared compose values), `apps/backend/.env`, `apps/frontend/.env`, each created from its `.env.example`.
- The compose database runs in every profile, so it publishes its port on `127.0.0.1` only and takes its password from `POSTGRES_PASSWORD` in the root `.env` (required, no default; compose builds the containers' `DATABASE_URL` from it).
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
- Each module's wiring lives in `src/modules/<name>/Setup.ts` and is re-exported from its `index.ts`. `Setup.ts` manually constructs repository → service → use cases → controllers, then mounts routes with `app.register(...)`. Route files use full paths, so `Setup.ts` sets no prefix.
- **Cross-module access goes through the container's dependency registry**, not direct imports of another module's internals: a module publishes `container.dependencies.set(<MODULE>_MODULE_DEPENDENCIES, {...})` (a string token plus exported type), and dependents read it with `container.dependencies.get/require`. The dependency must also be declared in `dependencies` so it registers first. `tests/unit/*.moduleDependencies.test.ts` covers this per module.
- Shared infrastructure is exposed as **ports** on `container.ports`: `permissionService`, `campaignFactPort`, `storagePort` (local / S3 / in-memory; `npm run storage:check --workspace @dnd/backend` verifies it), `emailPort` (SMTP / noop). Modules may wrap ports (e.g. campaigns fills in `campaignFactPort.resolveCampaignAccess`).

### Module layout and request flow

Typical module folders: `domain/dto` (Zod schemas), `domain/entities` (Drizzle tables), `domain/repository`, `service/`, `useCase/`, `http/controller`, `http/routes/v1`, `permissions/`, optionally `email/`. There is no `config/` folder: permission keys live only in `permissions/` (a named object like `ASSETS_PERMISSIONS`, accessed by name), paths are inline in the routes file and `security` is a constant there.

Flow: route (Zod `schema` + `config.permission`) → controller (extends `AbstractController`, wraps work in `this.execute(...)`, which maps `ZodError` → `ValidationError` and unknown errors → `InternalError`) → use case (one class per operation, `execute(context, ...)`) → service (holds `db`, `transactionManager`, repository) → repository (Drizzle queries, takes the db/tx handle as first arg). Each operation has its own use case and controller (`handle`). The controller only parses input and passes the result on; the use case decides what the user gets and returns the response DTO. Mapping functions (`to<Entity>Response`) live next to the schema in `domain/dto/Response<Entity>Dto.ts`. The service holds only shared logic and exposes `db`, `transactionManager` and `repository` publicly. In `auth`, use cases return the session next to the response DTO because controllers set the token cookies (`http/AuthHttpSupport.ts`); the sub-services under `auth/service` keep the domain logic.

DTOs derive from one `domain/dto/Base<Entity>Dto.ts` schema (`<Entity>BaseSchema`) via `pick`/`partial`/`extend`. Response schemas inherit the input rules, so check that stored data can't violate them before deriving a field; a violation becomes a 500 at serialization. Repository writes are named `create`/`update`/`delete` (with a suffix for secondary entities, status changes are `update*`); reads stay `find*`/`list*`/`count*`. There are no `/admin/...` routes: the route checks the permission and the use case picks the view by role. Boolean query parameters use `booleanQueryDto`, not `z.coerce.boolean()`, which turns "false" into `true`.

Rate limiting is central (`src/core/http/rateLimit.ts`): every route gets `ROUTE_RATE_LIMIT` (`GET` higher than writes), counted per user (or client IP when anonymous) and route pattern, so routes don't share a budget. Don't add limits per module; only auth routes and routes that send email set `config.rateLimit: SENSITIVE_ROUTE_RATE_LIMIT`, with a higher budget per IP because several users of one session often share a network. Routes that read media set `MEDIA_READ_ROUTE_RATE_LIMIT`, because a gallery asks for many files at once.

Auth attempts are counted on top of that in `auth_attempts` (`AuthAttemptService`): failed logins, refreshes and verification codes, plus every auth email. Limits are per account or token and, much higher, per IP; blocked requests get 429 with `Retry-After`. Attempts must be recorded outside the request transaction, because the thrown error rolls it back.

Trusted devices (`trusted_devices`, `AuthTrustedDeviceService`) are opt-in: a checkbox on login or password reset, or `POST /me/trusted-device` later. A device still needs the password but has its own attempt limit, so attacks on the account can't lock it out. A password reset during a block lifts the block and links the browser automatically. Password changes, resets and logout from all devices remove all devices.

Busy database: the pool sets `connectionTimeoutMillis` and `lock_timeout` (5 s); both timeouts map to `ServiceUnavailableError` (503).

Inside `inTransaction`, only run queries on the `tx` handle. Calling something that uses its own `db` (for example another module's service or use case) needs a second pool connection while the first is held; with a row lock this can block the whole API (`tests/integration/campaign-memberships.concurrency.test.ts`). Do those lookups before opening the transaction.

### Auth, permissions, campaign context

- JWT access tokens carry `sub` (actor id), `systemRole` and `sv` (session version); request context is on `request.requestContext`. A valid signature is not enough: on every request `container.ports.sessionStatePort` (installed by `auth`) loads the user and accepts the token only if the account is ACTIVE and `sv` equals `users.session_version`; the role comes from the database. Raise `session_version` (`AuthRepository.updateSessionVersion`, or in the tracked user change) to end all access tokens at once: logout everywhere, password change/reset and role/status changes do. Without the port no token is accepted. `buildTestApp` provides a fake that trusts the token; pass `realSessionState: true` to test the real check.
- Registration never reveals whether an address has an account: `POST /auth/register` and `.../request-verification` always answer 202 `{status:"accepted"}` (a taken address gets an info mail instead of a code; while unverified, the latest registration sets the password), `.../verify-email` takes email + code and answers every failure with the same 409. The emailed link only verifies and redirects to `/login?verified=1|0`; it never signs in. Verification and confirmation codes travel by email only, never in a response. Email changes go through `POST /me/email-change` (current password if the account has one), stay in `users.pending_email` and only take effect after `POST /me/email-change/confirm` or the emailed link; the old address gets a notice. `PATCH /me` does not take `email`. OAuth never links to an existing account: if the provider's email is already used (password account or another provider), sign-in is refused with `OAUTH_EMAIL_IN_USE`. Invitations match by email only for verified addresses. `GET /users?search=` matches email addresses only for system admins (everybody else: display name and user tag). User input in `ilike` goes through `escapeLike` (`#core/db/escapeLike`). Redirect targets from clients go through `normalizeRedirectPath`, which keeps only same-origin paths.
- Every route under `/api/v1` sets exactly one of `config.permission = { key, hideAsNotFoundForPlayers? }` or `config.public: "<reason>"`; otherwise registration throws at startup (`assertRouteDeclaresAccess`), and `tests/unit/routeAccess.test.ts` lists the public routes. Permission definitions of campaign-scoped keys set `campaignRoles` (`ANY_CAMPAIGN_ROLE`, `CAMPAIGN_EDITOR_ROLES`, `CAMPAIGN_OWNER_ROLE`) and optionally `campaignRoleDenial: "notFound"`; on routes with `:campaignId` the hook checks them before the use case (non-members 404, other roles 403/404, system admins pass). Use cases keep their own checks. The authorization `preValidation` hook (`src/core/http/authorization.ts`) calls `permissionService.require` against `request.campaignContext`, falling back to a `"global"` context. Request context, campaign context and authorization run in `preValidation`, so 401/403 come before schema validation (400); malformed campaign ids are ignored there and left to the schema.
- `request.campaignContext` is resolved from a `:campaignId` route param or an `x-campaign-id` header via `campaignFactPort.resolveCampaignAccess`.
- Adding a permission: define keys + `PermissionDefinition`s (with `campaignRoles` for campaign routes) in the module's `permissions/`, register them in `Setup.ts` (`permissionService.registerDefinitions`), and add keys to the aggregation in `src/modules/auth/permissions/permissions.ts` (`ALL_PERMISSIONS`, `APPLICATION_USER_PERMISSIONS`). System role → permission mapping is in `src/modules/auth/permissions/roles.ts`.
- Linkable content (notes, spells, NPCs, locations, ...) shares its identity in `assets` (`src/modules/assets`). Domain modules don't write `assets` themselves. They call the `AssetsModuleDependencies.service` port (`createBase`, `updateMetadata`, `archiveBase`, `restoreBase`, `assertAvailable`, `resolveVariant`, ...) inside their own transaction and check their own domain permissions. Players only see campaign assets that a registered `AssetVisibilityProvider` (e.g. content shares) grants.
- Rule content (features, and later classes, species, feats, spells, items, backgrounds …) reaches players differently from story content: global content is always visible if it fits the campaign ruleset; custom content needs a release per asset (`assets.released_to_players`, tracked, campaign assets only), after which every player of the campaign sees and may use it, read-only. Modules allow it with `AssetsService.registerReleasableType`; assets itself then provides the released active ids as a visibility provider. Rule content is not registered as shareable. Features become visible through a released source (to be added by the source modules), and content assigned to a character stays readable after a release is withdrawn (to be added by the character modules).
- Players see story content through shares (`src/modules/content-shares`): a GM reveals one asset to all or to selected active players, until revoked or until `expiresAt`. Global assets fitting the campaign ruleset can be shared as well, to draw attention to them; each campaign has its own share. A share is no content, so it has no history and no soft delete: revoking deletes it, an expired share is hidden at once and deleted before the next list or change (outside the transaction, so a refused request can't roll it back). Only asset types a module registers with `ContentSharesModuleDependencies.service.registerShareableType` can be shared, optionally with `assertShareable`. The registration also brings `loadPlayerContent` and `playerContentSchema`: `GET /campaigns/:campaignId/shares/:shareId/content` resolves a share to the module's player view (editors get it as a preview), and only what the schema describes leaves the server. The client picks its view by `assetType`. Players poll `GET /campaigns/:campaignId/shares?since=` for new shares; there is no push yet.
- Notes (`src/modules/notes`) are the first domain module on assets and the pattern for the following ones: own note id plus `asset_id` (unique active, composite FK to `assets(id, campaign_id)`). The asset holds name, summary, status and tags, the note row the text. Create writes asset, note, tags and `relatedLinks` in one action; updates send `expectedVersion` (note) and `expectedAssetVersion` (asset) and change tags before asset fields, because tags are locked before the asset. DELETE archives the asset and restore brings it back. When a note's asset leaves ACTIVE (draft or archive, on every path), a deactivate hook (`AssetsService.registerDeactivateHook`) ends its shares, and they don't come back. Lists carry no text; it comes with the detail view. GMs and editors write; players only read active notes shared with them, in the player view, which is also the share content. Slugs come from `slugify` in assets (`unique` for names that may repeat). Asset-links edit routes are built in batches per asset type (`registerEditRoute`).
- Features (`src/modules/features`) are declarative rule definitions (parameters, choices, resources, scaling, activations, effects, supersedes) on assets of type `FEATURE`, global (`/features`, administrators only, rulesets in the body) or custom per campaign (`/campaigns/:campaignId/features`). `/campaigns/:campaignId/catalog/features` lists what a campaign may use: active global features for its ruleset plus its own (for players only released ones). Each graph part is one jsonb column, checked by the Zod schemas plus `validateFeatureDefinition` (unique keys, references between parts, only whitelisted variables such as `level.class`, `param.<key>`, `scale.<key>`, `resource.<key>.max`, expression limits). The rule parts form one history group, and an update fills in unsent parts from the base version, so a concurrent change to any of them is a 412 instead of a mix. Referenced assets (supersede targets, linked options, asset defaults) are checked in the history `guard` (missing/foreign 404, archived, incompatible or cyclic 409) and block archiving through an asset-links usage provider. `POST .../resolve` binds parameters, choices and scaling for an actor snapshot and computes values without storing anything; results are cached in-process by feature and asset version. `FeaturesService.evaluateEffects` combines several features (stacking modes, upgrade/replace) for source modules. Expression and payload contracts live in `#core/rules`.
- Text content is stored as typed and made safe when it is shown, not refused when it is saved. The server renders Markdown (`#core/text/safeMarkdown`) with markdown-it (`html: false`, raw HTML becomes text, script links are dropped) into `contentHtml`. The frontend may insert only such server-rendered HTML, through one `SafeHtml` component that sanitizes it again with DOMPurify; `v-html` is forbidden everywhere else (`vue/no-v-html`). Raw fields such as `content` and `gmNotes` are shown as text only. SQL safety comes from Drizzle's parameterized queries, so text is never escaped for storage.
- Relations between assets live in `asset_links` (`src/modules/asset-links`). Domain modules register their relations (`service.relations.register`), usage providers and edit routes through `AssetLinksModuleDependencies.service` and call `createLink`, `updateLink` and `removeLink` inside their own action. A new relation needs an entry in `VALID_METADATA` in `tests/integration/asset-links.http.test.ts`. Whatever must stop an asset from being archived goes through `blocksTargetArchive` or `listBlockingUsages`; it runs as a `guard` of the tracked asset, so undoing and restoring can't bypass it.
- Uploaded files live in `media_files` (`src/modules/media`). Uploads go in 8 MiB parts through the API (`media_uploads`, `MediaUploadService`): announce the file, `PUT` the parts in any order, complete. A client that lost its connection asks which parts arrived. Size limits apply when announcing, the type check and hash run on completion. A file row only exists once all of that succeeded. A deleted row stays until `objectDeletedAt` is set, and `npm run media:cleanup` (`MediaCleanupService`) repairs the rest, including expired uploads; it needs an external schedule.
- Limits are `MEDIA_DEFAULT_LIMITS` (`media/domain/MediaLimits.ts`): largest file per type and total per campaign, including running uploads. Variants don't count. Another module can replace single values per campaign with `MediaModuleDependencies.quota.registerLimitsProvider`; media itself knows nothing about the reason. They only apply when the storage is S3 (`MediaQuotaService`); production always uses S3.
- Listing files, announcing and completing an upload, aborting it and deleting a file return `storageUsage` (`usedBytes`, `totalBytes`), so the frontend needs no extra request. It is `null` unless the viewer is an administrator or the campaign owner, and without S3. For everybody else, a 413 also has no numbers.
- Content always starts at `GET /campaigns/:campaignId/media/:mediaId/content`, which checks the rights on every request and then redirects to a signed storage link, so the bytes don't pass through the API and range requests work. A revoked right can last until the link ends (at most twice `STORAGE_DOWNLOAD_URL_TTL_SECONDS`). `LocalStorage` and `InMemoryStorage` can't do that (`supportsDirectDownload`), so there the API streams. Links contain `STORAGE_S3_PUBLIC_ENDPOINT`, which must not be the origin of the app.
- Images get WebP variants (`media_variants`, `?variant=thumbnail|display`) from a separate process, `npm run media:worker` (`MediaVariantService`, `sharp`), which `npm run dev` starts too. Until a variant is ready, the original is delivered. The API must not import `sharp`.
- Campaign-scoped updates use optimistic locking (`src/core/db/optimisticLock.ts`, `version` column, `VersionConflictError` → HTTP 412).

### History

Changes to content are recorded per field in the `history` module (`#core/history`, `src/modules/history`). Tracked today: `asset`, `assetLink`, `campaign`, `campaignMembership`, `ruleset`, `tag`, `assetMedia`, `note`, `feature`, `user`. Read through `GET /history/:entityType/:entityId`, undo through `POST /history/events/:eventId/revert`, restore through `POST /history/:entityType/:entityId/versions/:version/restore`.

- **Writing:** use cases that change tracked rows extend `MutationUseCase` (`authorize` returns `authorized()` or `publicAction("reason")`, `perform` does the work; lookups in other modules go in `prepare`, before the transaction) and write only through `scope.create`, `scope.change` and `scope.softDelete`. Use `history.runAction` directly only if work has to follow the commit, such as an email. An ESLint rule forbids direct writes to tracked tables.
- **New tables:** define `history/Tracked<Entity>.ts` with `defineTrackedEntity`, register it in `Setup.ts`, and add the table to `TRACKED_TABLES` in `eslint.config.js`. A table without history needs a reason in `UNTRACKED_TABLES` in `tests/unit/history.schema.test.ts`, and each tracked entity needs a fixture in `tests/integration/history.rights.http.test.ts`; both tests fail otherwise.
- **Rules:** `validate` checks the merged state without database access, `guard` also gets the transaction. Both run for every change, including undoing and restoring.
- **Lists of other modules:** a module can store a list per asset as a field of the asset with `AssetsService.registerTrackedList` and change it with `updateTrackedList`, like `tagIds`. It shares the version and the history rights of the asset, so editors may assign tags but only GMs and administrators read or undo that history.
- **Fields:** every column is classified: `value`, `counter`, `position`, `list`, `account` and `secret` (no value is ever stored), or `ignore`. Fields that grant rights use `field.value({ revertible: false })`. Set the limit in the definition, otherwise `standard` applies.
- **Rights:** the history only exists for people who may change the content; seeing it is not enough. Everybody else gets 404. Use `campaignHistoryAccess` with `editRoles` for campaign content; players only get rows through `ownedByPlayer`. System admins pass every check, but technical limits apply to them too. Rights use the role at access time and the campaign from the row, never from the client.
- **Behavior:** undoing and restoring are new entries, the history is never rewritten. Deleted rows stay deleted and their history is no longer readable. Archived content can be restored. Conflicts are detected per field through `baseVersion`, and `merged` reports values that were kept.
- **Deliberately direct:** `campaign_invitations` (nothing to restore), `media_files` (nobody can edit a file; the status only records the upload), the ruleset progression tables (never change), and for `users` the own profile and everything in `auth`, because that history only covers changes by administrators. For the same reason, `user.update` keeps a strict version check.

### Errors

Throw subclasses of `AppError` / the HTTP errors in `src/core/error/http/` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, ...). `registerErrorHandler` plus `errorMapper` turn them into the standard error payload. Modules add their own under `error/http/` when needed.

### Tests

- `apps/backend/tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts` are separate Jest projects (SWC transform, `maxWorkers: 1`). `tests/unit/http.validation.test.ts` uses snapshots.
- Integration HTTP tests use `buildTestApp` with signed test JWTs and `app.inject`; `tests/helpers/factories.ts` and `deterministic.ts` give fixtures.

## Frontend UI reference

`example/UI/` holds mockup screenshots ("Chronik", German UI) to use as a reference for UI templates and the theme:

- `chronik-ui-mockups/`: desktop screens, numbered by content type. Each type has a list screen (`NN-<type>-liste.png`) and a create/edit screen (`NN-<type>-erstellen-bearbeiten.png`): Orte, NPCs, Monster, Gegenstände, Zauber, Quests, Encounter, Klassen, Spezies, Storylines. There are also auth screens (21–22) and import screens (24–25).
- `chronik-ui-mobile-mockups/`: the same screens at mobile size (`*-mobile.png`).

**The screenshots are not consistent with each other.** Use them only for the basic theme and design language, not as an exact spec for layout, fields, labels or data. The common look:

- dark navy sidebar and top bar
- parchment-textured content area with ornamental corners
- deep burgundy/wine primary color for actions, active nav and links
- serif typography
- soft colored pill tags
- table lists with filter bars and pagination
- create/edit opens as a right-hand slide-over panel with section tabs on the left and Verwerfen/Speichern actions in the footer

### Theme and component rules

- **Styling uses Tailwind** (`apps/frontend/tailwind.config.ts`, `src/assets/main.css`). Custom CSS is fine where Tailwind isn't enough, for example parchment textures, ornamental borders or complex animations, as long as it is well structured: put it in a clear place (an `@layer` in the global stylesheet or a scoped component style), give it meaningful names, and use the theme variables instead of hardcoded values.
- **Theme values are variables.** Colors, fonts, radii, shadows, spacing and other basic theme elements are defined once as CSS custom properties (in `main.css`, e.g. `--color-primary`). They are mapped to Tailwind theme keys in `tailwind.config.ts` (e.g. `primary: "var(--color-primary)"`). Components only use these semantic Tailwind classes (`bg-primary`, `text-ink`), never raw hex values or arbitrary values like `bg-[#7a1f2b]`. To change the theme, change the variables.
- **Structure lives in reusable Vue components.** Build the shared UI pieces as components in `src/components/` and compose pages and layouts from them: app shell/sidebar/top bar, page header, buttons, inputs/selects, tags, filter bar, data table, pagination, slide-over form panel. Don't repeat the markup in each page.
- The current `tailwind.config.ts` colors (`parchment`, `ink`, `ember`, `spruce`) and the `.layout-*` classes in `main.css` are early placeholders with hardcoded hex values. Move them to the variable-based setup when working on the theme.

## Git

- Commit messages must **not** contain a `Co-Authored-By: Claude ...` trailer or any other Claude/AI attribution line.

## Notes

- `copilot-docs/` is gitignored, older reference material (it calls the wiring file `setup.ts`; the real convention is `Setup.ts`). Its `module-setup.md` describes the module checklist used above.

## Optional local tooling: graphify

graphify is optional and runs only locally. If it is configured in a workspace (the `graphify` CLI and `graphify-out/graph.json` exist), use it as described in the `## graphify` section below. If not, ignore that section and work as usual. Nothing in the project may depend on it: the app, tests, CI and npm scripts must work without it.

- Build and update the graph only with `graphify update .`, which extracts locally from the code. Don't use the hosted graphify platform and don't configure API keys or external backends for it.
- The files graphify creates stay in the local workspace and are never committed: `graphify-out/`, `.claude/skills/`, `.claude/settings.json` and `.claude/CLAUDE.md`. They are excluded through `.git/info/exclude`, not `.gitignore`.
- To set it up in a checkout, add those exclusions, then run `graphify install --project`, `graphify claude install --project` and `graphify update .`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
