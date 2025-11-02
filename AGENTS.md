# Repository Guidelines

## Project Structure & Module Organization
The monorepo is organized with pnpm and Turborepo. Service code lives in `apps/`, e.g. `apps/cache-service`, `apps/reviews-service`, and `apps/search-service`, each following the NestJS module layout (`src`, `test`, `dist`). Shared utilities and configurations are under `packages/` (`packages/logger`, `packages/schema`, `packages/typescript-config`, etc.). Operational assets reside in `docs/`, `scripts/`, `docker-compose.yml`, `prometheus.yml`, and the `grafana/` dashboards. Performance tooling sits in `packages/tools/k6` and writes reports to `packages/tools/k6/results`.

- Keep telemetry imports at the top of every service entry point (`apps/*/src/main.ts`) so OpenTelemetry hooks before Nest modules load.
- `apps/cache-service/src/lib/cache/module.ts` injects Redis or Dragonfly adapters based on `CACHE_TYPE`, while strategy classes under `strategies/` encapsulate LFU/LRU/hybrid logic.
- `packages/schema/src/reviews/review.schema.ts` exports the Mongo schema consumed by both `apps/search-service` and `apps/reviews-service`, keeping database shape centralized.
- Observability assets (`prometheus.yml`, `grafana/`) expect each service to expose metrics on port 9464; align new services with that convention.

## Build, Test, and Development Commands
Use pnpm across the workspace:
- `pnpm install` bootstraps dependencies and links workspaces.
- `pnpm dev` runs `turbo run dev` for all services; scope locally with `pnpm --filter @daap/cache-service dev`.
- `pnpm build` or `pnpm build:services` produce production bundles in `dist/`.
- `pnpm start:services` boots the three core services with watchers; `pnpm docker:up` provisions supporting containers.
- Quality gates: `pnpm lint`, `pnpm format`, `pnpm test`, and `pnpm test:integration`.
- Performance checks: `pnpm k6:test` (append `--strategy lru|lfu|hybrid` as needed).
- Use `pnpm --filter ... lint` or `... test` to keep Turbo caching fast when touching a single workspace.
- `pnpm db:create-indexes` delegates to `scripts/create-text-indexes.js` to recreate MongoDB text indices after schema changes.
- Compose `pnpm docker:up` with `pnpm start:services` to mirror the full stack (Redis, Mongo, Jaeger) that local development relies on.

## Coding Style & Naming Conventions
TypeScript targets Node 18+ with NestJS. Follow the shared ESLint rules from `packages/eslint-config` and apply formatting via `pnpm format` (Prettier 3, 2-space indentation). Name files with lowercase kebab-case, classes/modules in `PascalCase`, functions/variables in `camelCase`, and environment variables in `UPPER_SNAKE_CASE`. Keep telemetry initialization imports (see `apps/cache-service/src/main.ts`) at the top so tracing hooks first.
- Extend linters with workspace-relative configs (`packages/eslint-config`, `packages/typescript-config`) instead of local overrides to avoid drift across services.
- Shared DTOs and schemas should live in `packages/schema` so both `apps/search-service` and `apps/reviews-service` receive updates simultaneously.
- New cache backends must implement `CacheAdapter` (`apps/cache-service/src/lib/cache/adapter.ts`) and be registered inside `CacheModule` to comply with inversion-of-control expectations.

## Testing Guidelines
Unit specs live in `apps/*/test` with the `.spec.ts` suffix; Jest presets come from `@daap/jest-presets/node`. Run targeted suites with `pnpm --filter @daap/search-service test`. Turbo pipes coverage reports into each package’s `coverage/` directory, so CI should watch for regressions there. Run `pnpm test:integration` before merging to exercise cross-service contracts. Use `pnpm k6:test` after major cache or search changes to baseline latency.
- Redis-backed specs such as `apps/cache-service/test/lfu.spec.ts` require a running Redis instance (see `docker-compose.yml` or configure `CACHE_HOST`/`CACHE_PORT` for tests).
- Integration checks load `scripts/test-integration.js`; ensure all three services expose `/health` and `/metrics` endpoints so assertions against readiness succeed.
- Performance runs write summaries to `packages/tools/k6/results`; commit comparisons rely on timestamps, so avoid manual edits to generated JSON/HTML artifacts.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits (`feat(cache):`, `docs:`). Keep subjects imperative and include the workspace scope when touching a single package. Pull requests should summarize the change set, link related issues or docs, list the commands executed (`pnpm test`, `pnpm lint`, etc.), and attach logs or screenshots for observability updates. Request reviewers from the owning service and ensure infrastructure changes mention required environment secrets.
- Include telemetry or k6 output in PR descriptions when modifying cache strategies to document performance deltas for reviewers.
- Mention any schema migrations or index rebuilds (triggered via `pnpm db:create-indexes`) so deployment runbooks capture the necessary manual steps.
- When touching shared packages, flag dependent services (`@daap/cache-service`, `@daap/search-service`, etc.) in the PR checklist to prompt downstream testing.
