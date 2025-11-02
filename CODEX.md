# CODEX Playbook
## System Architecture
- Reviews ingress (`apps/reviews-service/src/main.ts`) wires global interceptors for pino + Jaeger; expect every controller to rely on request-scoped `ILoggerService` from `src/lib/modules/global/logger` for consistent tracing.
- Cache service (`apps/cache-service/src/main.module.ts`) wraps caching logic via `CacheModule` with Redis/Dragonfly adapters and strategy injection; check `src/lib/cache/module.ts` for env-driven wiring.
- Search service uses `packages/schema/src/reviews/review.schema.ts` to register MongoDB text index and handles sanitized queries in `src/modules/search/service.ts` (traces span names at `search.mongodb_query`).
- Data flow: reviews controller (`apps/reviews-service/src/modules/reviews/controller.ts`) → cache service HTTP client (`apps/cache-service/src/modules/search/service.ts`) → search service → Mongo; fallback path hits search directly when cache fails.
## Critical Flows
- Always import `./tracing` before Nest bootstrapping in every service main (`apps/*/src/main.ts`) to initialize OpenTelemetry (`packages/telemetry/src/sdk.ts`); missing this causes spans + Prometheus exporter to stay silent.
- `initializeMetrics` from `packages/telemetry/src/metrics.ts` runs inside bootstrap to expose `/metrics` on port 9464; update Prometheus discovery via `prometheus.yml` when adding services.
- Cache key normalization & fuzzy fallback live in `apps/cache-service/src/modules/cache/service.ts`; adjust thresholds via `ENABLE_FUZZY_CACHE`, `FUZZY_*` envs and eviction knobs defined in `src/lib/cache/lfu-manager.service.ts` + `strategies/*.ts` before tuning tests.
- Keyword extraction uses Porter stemming (`apps/cache-service/src/lib/cache/keyword.service.ts`); when adding languages, extend stop word list and ensure tests in `apps/cache-service/test/lfu.spec.ts` cover regressions.
- Reviews service search proxy (`apps/reviews-service/src/modules/search/service.ts`) first hits cache, falls back to search-service, and invalidates cache via `/cache/invalidate`; reuse this flow when adding new read endpoints instead of bypassing cache.
## Build & Local Ops
- Install deps once with `pnpm install`; use scoped commands such as `pnpm --filter @daap/cache-service dev` or `pnpm build:services` for all builds (Turbo caching depends on `turbo.json`).
- `pnpm test` fans out Jest using `@daap/jest-presets/node`; cache specs touch live Redis (`apps/cache-service/test/lfu.spec.ts`), so run `docker-compose up redis` or point `CACHE_HOST` to a test instance before running locally.
- Text search requires Mongo text index matching `packages/schema/src/reviews/review.schema.ts`; run `pnpm db:create-indexes` (wrapper around `scripts/create-text-indexes.js`) whenever schema/index weights change.
- Integration harness expects all services + infra via `docker-compose.yml`; Traefik routes `http://reviews.localhost`, `http://cache.localhost`, `http://search.localhost` inside the shared `daap_app_network` network.
- Performance baselines rely on k6 scripts under `packages/tools/k6/scripts`; execute `pnpm k6:test --strategy lru` which shells to `scripts/run-k6-test.sh` (requires Docker + InfluxDB container and writes artifacts to `packages/tools/k6/results`).
## Observability & Telemetry
- Custom semantic attributes live in `packages/telemetry/src/constants.ts`; when emitting spans from new modules use these keys so Grafana dashboards under `grafana/dashboards` continue parsing hit/miss/hybrid charts.
- Cache metrics gauge callbacks register in `CacheService` constructor; exposing new counters means extending `CacheMetricsService` (`packages/telemetry/src/cache-metrics.ts`) and binding them before Nest instantiates modules.
- Reviews logging pipeline (`apps/reviews-service/src/lib/modules/global/logger/service.ts`) streams to Elasticsearch if `ELK_URL` is set; keep `HttpLoggerInterceptor` and `TracingInterceptor` (`src/interceptors/logger`) registered globally to preserve trace context.
- Prometheus scrapes every 15s (`prometheus.yml`); when changing metric ports ensure environment vars in `docker-compose.yml` stay aligned or Grafana panels will break.
## Conventions & Gotchas
- Shared TypeScript config + ESLint rules ship from `packages/typescript-config` and `packages/eslint-config`; prefer 2-space indentation and keep telemetry imports first as shown in each service main file.
- Cache adapters are selected via `CACHE_TYPE`; new backends implement `CacheAdapter` (`apps/cache-service/src/lib/cache/adapter.ts`) plus registration inside `CacheModule` factory.
- Secrets services extend Nest `ConfigService` (`apps/*/src/lib/modules/global/secrets/service.ts`) and expose typed getters; rely on them instead of reading `process.env` directly to keep tests injectable.
- When adding endpoints, update corresponding `HealthModule` + `/metrics` watchers so Traefik/Prometheus health checks defined in `docker-compose.yml` keep succeeding.
