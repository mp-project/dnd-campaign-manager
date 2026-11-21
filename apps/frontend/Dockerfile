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
CMD ["npm", "run", "dev", "--workspace", "@dnd/frontend", "--", "--host", "0.0.0.0"]

FROM dependencies AS build
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_PUSHER_BEAMS_INSTANCE_ID=
ENV VITE_PUSHER_BEAMS_INSTANCE_ID=$VITE_PUSHER_BEAMS_INSTANCE_ID
ARG VITE_DEMO_URL=
ENV VITE_DEMO_URL=$VITE_DEMO_URL
ARG VITE_SITE_URL=
ENV VITE_SITE_URL=$VITE_SITE_URL
ARG VITE_COOKIEBOT_ID=
ENV VITE_COOKIEBOT_ID=$VITE_COOKIEBOT_ID
ARG VITE_CLERK_PUBLISHABLE_KEY=
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_FARO_URL=
ENV VITE_FARO_URL=$VITE_FARO_URL
ARG VITE_LOG_REMOTE_LEVEL=info
ENV VITE_LOG_REMOTE_LEVEL=$VITE_LOG_REMOTE_LEVEL
ARG VITE_APP_ENV=production
ENV VITE_APP_ENV=$VITE_APP_ENV
ARG VITE_APP_RELEASE=
ENV VITE_APP_RELEASE=$VITE_APP_RELEASE
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_SENTRY_REPLAY_SAMPLE_RATE=0.1
ENV VITE_SENTRY_REPLAY_SAMPLE_RATE=$VITE_SENTRY_REPLAY_SAMPLE_RATE
ARG VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE=1.0
ENV VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE=$VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE
# The build prerenders the public pages in Chromium; only this stage carries it, not the image.
RUN npx playwright install --with-deps chromium
COPY . .
# The Sentry auth token comes as a build secret (compose: SENTRY_AUTH_TOKEN), never as an argument,
# so it stays out of the image and its history; without it the build uploads no source maps.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
  SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
  npm run build --workspace @dnd/frontend

FROM nginx:1.27-alpine AS production
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
