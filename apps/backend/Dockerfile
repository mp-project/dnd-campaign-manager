FROM node:24-trixie-slim AS base
WORKDIR /workspace
ENV CI=true
RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/test-utils/package.json packages/test-utils/package.json
RUN npm ci

FROM dependencies AS development
COPY . .
CMD ["npm", "run", "dev", "--workspace", "@dnd/backend"]

FROM dependencies AS build
COPY . .
RUN npm run build --workspace @dnd/backend

FROM base AS production-dependencies
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/test-utils/package.json packages/test-utils/package.json
# Optional dependencies stay: they hold the prebuilt binaries of sharp.
# npm nests packages it can't hoist under the workspace (apps/backend/node_modules); the folder is
# created in any case so the production stage can copy it.
RUN npm ci --omit=dev --workspace @dnd/backend --include-workspace-root=false \
  && mkdir -p apps/backend/node_modules \
  && npm cache clean --force

FROM gcr.io/distroless/nodejs24-debian12:nonroot AS production
WORKDIR /workspace/apps/backend
ENV NODE_ENV=production
COPY --from=production-dependencies /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies /workspace/apps/backend/node_modules ./node_modules
COPY --from=build /workspace/apps/backend/dist ./dist
COPY --from=build /workspace/apps/backend/drizzle ./drizzle
COPY --from=build /workspace/apps/backend/package.json ./package.json
# Numeric (distroless "nonroot" is 65532): Kubernetes can only verify runAsNonRoot for a numeric user.
USER 65532:65532
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD ["/nodejs/bin/node", "-e", "const p=process.env.PORT; if(!p){process.exit(1);} fetch('http://127.0.0.1:'+p+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# instrumentation.js starts OpenTelemetry and Sentry before the app when they are configured;
# --enable-source-maps turns stack traces (logs, Sentry) back into the TypeScript sources.
CMD ["--enable-source-maps", "--import", "./dist/instrumentation.js", "dist/index.js"]
