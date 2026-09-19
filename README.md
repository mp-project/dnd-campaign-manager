# dnd-campaign-manager

node webapp to manage dnd campaign

## Monorepo Layout

- apps/backend: Fastify API, own env and Dockerfile
- apps/frontend: Vue app, own env and Dockerfile
- packages/test-utils: shared test helpers
- root: workspace orchestration, shared compose settings

## Environment Files

- Root shared compose values: .env (from .env.example)
- Backend app values: apps/backend/.env (from apps/backend/.env.example)
- Frontend app values: apps/frontend/.env (from apps/frontend/.env.example)

## Local Development

- Start backend + frontend together from root:
	- npm run dev
- Backend local URL output appears as:
	- REST-API: http://api.localhost:3000/api/v1 (OK)
- Frontend local URL output appears as:
	- http://app.localhost:5173/

## Docker Orchestration

- Start full stack from root:
	- docker compose up --build
- Services in compose:
	- backend API container (intern, Port BACKEND_PORT)
	- frontend static container (intern, Port 80)
	- postgres on DB_PORT
	- mailpit for local SMTP testing on MAILPIT_SMTP_PORT and inbox UI on MAILPIT_UI_PORT
	- caddy tls proxy as public ingress on CADDY_HTTP_PORT and CADDY_HTTPS_PORT

## HTTPS with Caddy

- API domain:
	- https://api.localhost:8443
- Frontend domain:
	- https://app.localhost:8443
- Caddy routes requests to backend and frontend containers and issues local certificates with tls internal.

## Local Mail Testing

- Mailpit SMTP (backend target):
	- localhost:${MAILPIT_SMTP_PORT}
- Mailpit inbox UI:
	- http://localhost:${MAILPIT_UI_PORT}
