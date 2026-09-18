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
COPY packages/test-utils/package.json packages/test-utils/package.json
RUN npm ci --omit=dev --omit=optional --workspace @dnd/backend --include-workspace-root=false \
  && npm cache clean --force

FROM gcr.io/distroless/nodejs24-debian12:nonroot AS production
WORKDIR /workspace/apps/backend
ENV NODE_ENV=production
COPY --from=production-dependencies /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/backend/dist ./dist
COPY --from=build /workspace/apps/backend/drizzle ./drizzle
COPY --from=build /workspace/apps/backend/package.json ./package.json
USER nonroot:nonroot
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD ["/nodejs/bin/node", "-e", "const p=process.env.PORT; if(!p){process.exit(1);} fetch('http://127.0.0.1:'+p+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["dist/server.js"]
