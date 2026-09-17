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
CMD ["npm", "run", "dev", "--workspace", "@dnd/frontend", "--", "--host", "0.0.0.0"]

FROM dependencies AS build
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN npm run build --workspace @dnd/frontend

FROM nginx:1.27-alpine AS production
COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
