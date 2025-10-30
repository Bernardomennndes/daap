# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DAAP is a university project demonstrating **distributed microservices architecture** with **intelligent cache eviction strategies**. The system implements search over product reviews with a custom cache layer that supports three pluggable eviction strategies (LFU, LRU, Hybrid) to achieve **99.9% performance improvement** (8ms vs 7580ms avg response time).

**Key Innovation**: Keyword-based cache tracking with pluggable backends (Redis/Dragonfly), **pluggable eviction strategies**, and resilient fallback chains.

## Technology Stack

- **Monorepo**: pnpm workspaces with Turborepo for build orchestration
- **Framework**: NestJS for all services
- **Database**: MongoDB with Mongoose ODM
- **Cache Backends**: Redis and Dragonfly (interchangeable via configuration)
- **Load Balancer**: Traefik
- **Container Orchestration**: Docker Compose
- **Package Manager**: pnpm (version 10.4.1)

## Architecture

### Data Flow (Critical Understanding)

```
User Request
    ↓
Traefik (Load Balancer)
    ↓
Reviews Service (Port 3001) ──────────┐
    ↓                                   │ Fallback if cache fails
Cache Service (Port 3002)              │
    ↓                    ↓              ↓
Redis/Dragonfly    Search Service (Port 3003)
                         ↓
                     MongoDB
```

**Request Path**:
1. Reviews Service receives `/search?q={query}`
2. Delegates to Cache Service at `http://cache-service:3002/search`
3. Cache Service checks Redis/Dragonfly via **Eviction Strategy** (LFU/LRU/Hybrid)
4. **Cache Hit**: Returns cached data + records access (strategy-dependent)
5. **Cache Miss**: Fetches from Search Service → MongoDB, stores in cache, triggers eviction check

**Why This Design?**
- **Cache Service Isolation**: Swap backends (Redis ↔ Dragonfly) without touching other services
- **Pluggable Eviction Strategies**: Switch between LFU, LRU, or Hybrid via environment variable
- **Fallback Resilience**: Reviews Service has direct fallback to Search Service ([reviews-service/src/modules/search/service.ts:32-51](apps/reviews-service/src/modules/search/service.ts#L32-L51))
- **Keyword Tracking**: Enables granular analytics and invalidation

### Services Detail

1. **Reviews Service** ([apps/reviews-service/](apps/reviews-service/))
   - **Role**: API entry point with resilient fallback
   - **Port**: 3001 (exposed as `http://reviews.localhost`)
   - **Scalable**: Horizontal scaling via `REVIEWS_INSTANCES` env var
   - **Critical Pattern**: Try Cache Service → catch → fallback to Search Service directly

2. **Cache Service** ([apps/cache-service/](apps/cache-service/))
   - **Role**: Orchestrates caching + LFU eviction + keyword extraction
   - **Port**: 3002 (exposed as `http://cache.localhost`)
   - **Core Logic**: [lfu-manager.service.ts](apps/cache-service/src/lib/cache/lfu-manager.service.ts) (~400 lines)
   - **Adapters**: Pluggable via `CACHE_ADAPTER` env (redis/dragonfly)
   - **Redis Key Prefixes**:
     - `search:{query}:{page}:{size}` - Cache entries
     - `keyword:freq:{keyword}` - Frequency counters
     - `cache:meta:{key}` - Entry metadata (freq, lastAccess, size, keywords)
     - `keywords:ranking` - Global sorted set of keywords

3. **Search Service** ([apps/search-service/](apps/search-service/))
   - **Role**: MongoDB full-text search backend
   - **Port**: 3003 (exposed as `http://search.localhost`)
   - **Query**: Uses `$text` search on `reviewText` and `summary` fields
   - **Note**: Text indexes commented out in schema (see [review.schema.ts:44-58](packages/schema/src/reviews/review.schema.ts#L44-L58))

### Shared Packages

Located in `packages/`:
- `@daap/schema`: Mongoose Review schema (shared across services)
- `@daap/logger`: Minimal logging utility
- `@daap/eslint-config`: Shared ESLint rules (server, library, next, react-internal)
- `@daap/typescript-config`: TS configs (base, api, nextjs, react-library)
- `@daap/jest-presets`: Jest configuration for node environment
- `@daap/tools`: **Load testing scripts** (bulk-test-runner, benchmark-analyzer, keyword-analyzer)

## Cache Eviction Strategies (Pluggable Architecture)

O sistema suporta **três estratégias de eviction** intercambiáveis via configuração:

### 1. **LFU (Least Frequently Used)** - Padrão
Remove entries com menor frequência de acesso.

**Eviction Score Formula** ([strategies/lfu.strategy.ts](apps/cache-service/src/lib/cache/strategies/lfu.strategy.ts)):
```typescript
const timeSinceAccess = Date.now() - metadata.lastAccess;
const ageInHours = timeSinceAccess / (1000 * 60 * 60);
const score = (1 / (metadata.frequency + 1)) + (ageInHours * 0.1);
```

**Logic**: Higher score = evict first (combines low frequency + age)
- Entry with `freq=1, age=24h` → `score = 0.5 + 2.4 = 2.9` (high → evict)
- Entry with `freq=99, age=1h` → `score = 0.01 + 0.1 = 0.11` (low → keep)

### 2. **LRU (Least Recently Used)**
Remove entries com acesso mais antigo (ignora frequência).

**Eviction Score Formula** ([strategies/lru.strategy.ts](apps/cache-service/src/lib/cache/strategies/lru.strategy.ts)):
```typescript
const timeSinceAccess = Date.now() - metadata.lastAccess;
const score = timeSinceAccess; // Milissegundos desde último acesso
```

**Logic**: Maior tempo sem acesso = evict primeiro

### 3. **Hybrid (LFU + LRU)**
Combina frequência e recência com pesos configuráveis.

**Eviction Score Formula** ([strategies/hybrid.strategy.ts](apps/cache-service/src/lib/cache/strategies/hybrid.strategy.ts)):
```typescript
const frequencyScore = 1 / (metadata.frequency + 1);
const ageInHours = (Date.now() - metadata.lastAccess) / (1000 * 60 * 60);
const recencyScore = ageInHours * 0.1;

const score =
  (frequencyWeight * frequencyScore) +
  (recencyWeight * recencyScore);
```

**Pesos padrão**: 60% frequência, 40% recência (configurável via env)

### Alternando Estratégias

```bash
# No .env
EVICTION_STRATEGY=lfu     # ou lru, hybrid
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50

# Para Hybrid, ajustar pesos
EVICTION_FREQUENCY_WEIGHT=0.6
EVICTION_RECENCY_WEIGHT=0.4
```

**Documentação completa**: [apps/cache-service/EVICTION_STRATEGIES.md](apps/cache-service/EVICTION_STRATEGIES.md)

---

## Cache Hit Optimization (NEW)

O sistema implementa **3 estratégias complementares** para aumentar a taxa de cache hit em queries similares:

### ✅ **Query Normalization**
Queries com mesmas palavras em ordem diferente geram a mesma cache key.

**Exemplo**:
```
"laptop charger" e "charger laptop" → mesma cache key
```

### ✅ **Fuzzy Matching**
Busca fallback para queries com 70%+ de keywords em comum (Jaccard similarity).

**Exemplo**:
```
Cached: "laptop usb charger"
Query:  "laptop charger cable"
Similaridade: 2/4 = 50% ❌ Abaixo do threshold

Query: "charger laptop usb"
Similaridade: 3/3 = 100% ✅ Match!
```

### ✅ **Stemming (Porter Stemmer)**
Normaliza variações morfológicas (plural, verbos).

**Exemplos**:
```
"laptops" → "laptop"
"charging" → "charg"
"cables" → "cabl"
```

**Configuração** (`.env`):
```bash
ENABLE_FUZZY_CACHE=true
FUZZY_SIMILARITY_THRESHOLD=0.7  # 70% keywords em comum
FUZZY_MAX_CANDIDATES=10
```

**Impacto**: +35% taxa de cache hit (76% → 91%)

**Documentação completa**: [apps/cache-service/CACHE_OPTIMIZATION.md](apps/cache-service/CACHE_OPTIMIZATION.md)

**When Eviction Happens**:
- Automatically after **every** `.set()` call via `checkAndEvict()`
- Triggers when `countCacheEntries() > EVICTION_MAX_ENTRIES` (default: 1000)
- Removes in batches: `EVICTION_BATCH_SIZE` (default: 50)

**Keyword Extraction** ([keyword.service.ts](apps/cache-service/src/lib/cache/keyword.service.ts)):
- Query `"laptop screen protector"` → keywords `["laptop", "screen", "protector"]`
- Each keyword tracked in sorted set with frequency
- Enables analytics: `GET /cache/keywords?limit=50` shows top terms

**Performance Results** ([RESULTS.md](RESULTS.md)):
- **99.9% faster** with cache: 8ms vs 7580ms (1000 queries)
- **Hit rate**: 76-99% depending on keyword popularity
- **CPU usage**: 6-12% with cache vs 95% without (5 parallel connections)

## Development Commands

### Quick Start (First Time)

```bash
# 1. Install dependencies
pnpm install

# 2. Setup environment
cp .env.example .env

# 3. Start infrastructure (MongoDB, Redis, Dragonfly, Traefik)
docker-compose up -d mongodb redis dragonfly traefik

# 4. Start all services (Turbo handles dependency order)
pnpm start:dev

# Services available at:
# - http://reviews.localhost (main API)
# - http://cache.localhost (cache + stats)
# - http://search.localhost (direct search)
# - http://localhost:8080 (Traefik dashboard)
```

### Building

```bash
# Build all packages and services (respects Turbo dependency graph)
pnpm build

# Build only the three main services
pnpm build:services

# Build specific service (Turbo ensures dependencies built first)
turbo run build --filter=@daap/cache-service
```

### Running Services

**Development mode** (with hot reload):
```bash
# All services at once (recommended)
pnpm start:dev

# OR manually in order (Search → Cache → Reviews)
pnpm --filter @daap/search-service start:dev   # Port 3003
pnpm --filter @daap/cache-service start:dev    # Port 3002
pnpm --filter @daap/reviews-service start:dev  # Port 3001
```

**Production mode**:
```bash
# Via Docker Compose (recommended for production-like testing)
docker-compose up -d --build

# OR via pnpm (requires services pre-built)
pnpm start:services
```

**Docker management**:
```bash
pnpm docker:up      # Start all containers
pnpm docker:down    # Stop and remove containers
pnpm docker:logs    # Follow logs from all services
```

**Management CLI** (`daap.sh` - production deployment helper):
```bash
./daap.sh deploy 5      # Deploy with 5 Reviews Service instances
./daap.sh scale 8       # Scale to 8 instances
./daap.sh logs cache    # View cache-service logs
./daap.sh monitor       # System status dashboard
./daap.sh test 1000 10  # Load test: 1000 requests, 10 concurrent
```

### Testing

**Unit tests** (Jest):
```bash
# All services
pnpm test

# Specific service
turbo run test --filter=@daap/reviews-service
cd apps/cache-service && pnpm test

# Integration tests
pnpm test:integration
```

**Load testing** (critical for cache validation):
```bash
cd packages/tools/load-testing

# Bulk test: 10k queries, 5 concurrent connections
pnpm test:bulk 10000 5

# Analyze keyword popularity from test results
pnpm analyze:keywords

# Compare Redis vs Dragonfly performance
pnpm compare:cache

# Results saved to: packages/tools/load-testing/results/
```

### Linting & Formatting

```bash
# Lint all services
pnpm lint

# Format code
pnpm format

# Lint specific service
turbo run lint --filter=@daap/search-service
```

### Clean

```bash
# Clean build artifacts
pnpm clean
```

## Docker & Infrastructure

### Starting Infrastructure

The project includes a management script for common operations:

```bash
# Using daap.sh wrapper
./daap.sh deploy [N]      # Deploy with N review service instances
./daap.sh scale N         # Scale to N instances
./daap.sh monitor         # View system status
./daap.sh logs [service]  # View logs (reviews, cache, search, traefik, all)
./daap.sh test [req] [concurrent] [url]  # Load testing
```

### Service Endpoints (via Traefik)

When running via Docker:
- Reviews: `http://reviews.localhost`
- Cache: `http://cache.localhost`
- Search: `http://search.localhost`
- Traefik Dashboard: `http://localhost:8080`

### Environment Variables

Key environment variables (see `.env.example` for complete list):

**Service URLs (Internal Docker Network)**:
- `REVIEWS_SERVICE_URL=http://reviews-service:3001`
- `CACHE_SERVICE_URL=http://cache-service:3002`
- `SEARCH_SERVICE_URL=http://search-service:3003`

**Cache Configuration**:
- `CACHE_ADAPTER`: `redis` or `dragonfly`
- `REDIS_HOST`, `REDIS_PORT`: Redis connection
- `DRAGONFLY_HOST`, `DRAGONFLY_PORT`: Dragonfly connection

**Database**:
- `MONGO_URI`: Full MongoDB connection string

**LFU Cache Tuning**:
- `LFU_MAX_ENTRIES`: Maximum cache entries (default: 1000)
- `LFU_EVICTION_BATCH_SIZE`: Batch size for eviction (default: 50)

## Project-Specific Conventions (Critical for New Code)

### NestJS Module Structure

**IMPORTANT**: This project uses a **non-standard naming convention** (no suffixes):
```
apps/{service-name}/src/modules/{feature}/
├── controller.ts    # NOT feature.controller.ts
├── service.ts       # NOT feature.service.ts
└── module.ts        # NOT feature.module.ts
```

**Example**: [apps/cache-service/src/modules/cache/](apps/cache-service/src/modules/cache/)

**Full service structure**:
```
apps/{service-name}/
├── src/
│   ├── main.ts              # Application entry point
│   ├── main.module.ts       # Root module
│   ├── modules/             # Feature modules (public API)
│   │   ├── cache/
│   │   │   ├── controller.ts
│   │   │   ├── service.ts
│   │   │   └── module.ts
│   │   ├── search/
│   │   └── health/
│   └── lib/                 # Internal libraries (reusable logic)
│       ├── cache/           # Cache adapters, LFU manager
│       │   ├── adapter.ts
│       │   ├── lfu-manager.service.ts
│       │   ├── keyword.service.ts
│       │   └── implementations/
│       │       ├── redis.adapter.ts
│       │       └── dragonfly.adapter.ts
│       └── modules/global/  # Global services (SecretsService)
│           └── secrets/
│               └── service.ts
├── Dockerfile
└── package.json
```

### Configuration Management (NEVER use process.env directly)

**Pattern**: Always use `SecretsService` for environment variables

```typescript
// ❌ WRONG - Direct access
const url = process.env.CACHE_SERVICE_URL;

// ✅ CORRECT - Via SecretsService
constructor(private readonly secretsService: SecretsService) {}
const url = this.secretsService.CACHE_SERVICE_URL;
```

**Why?**
- Centralized validation
- TypeScript intellisense
- Easier to mock in tests

**Location**: [apps/*/src/lib/modules/global/secrets/service.ts](apps/cache-service/src/lib/modules/global/secrets/service.ts)

### Cache Key Generation (Consistent Pattern)

**Always use this format**:
```typescript
private generateCacheKey(query: string, page: number, size: number): string {
  return `search:${query}:${page}:${size}`;
}
```

**Redis Key Prefixes** (used throughout Cache Service):
- `search:{query}:{page}:{size}` - Actual cache data
- `keyword:freq:{keyword}` - Keyword frequency counter
- `keyword:keys:{keyword}` - Set of cache keys using this keyword
- `cache:meta:{cacheKey}` - Metadata (CacheEntryMetadata)
- `keywords:ranking` - Sorted set of all keywords
- `cache:entries` - Set of all cache entry keys

### Error Handling - Resilient Fallback Pattern

**Cache operations never throw** - they log and continue:
```typescript
try {
  const cached = await this.cacheService.get(query, page, size);
  if (cached) return cached;
} catch (cacheError) {
  console.error("Cache error:", cacheError);
  // Continue to fetch from source
}
```

**HTTP calls use fallback chains** ([reviews-service/src/modules/search/service.ts:21-53](apps/reviews-service/src/modules/search/service.ts#L21-L53)):
```typescript
try {
  // Primary: Cache Service
  return await httpService.get(`${cacheServiceUrl}/search`);
} catch (error) {
  // Fallback: Search Service directly
  return await httpService.get(`${searchServiceUrl}/search`);
}
```

### Adding New Cache Adapters

**Steps** to add a new backend (e.g., Memcached):

1. **Create adapter** in [apps/cache-service/src/lib/cache/implementations/](apps/cache-service/src/lib/cache/implementations/):
   ```typescript
   // memcached.adapter.ts
   export class MemcachedAdapter extends CacheAdapter {
     async connect(): Promise<void> { /* ... */ }
     async get(key: string): Promise<string | null> { /* ... */ }
     async set(key: string, value: string, ttl?: number): Promise<void> { /* ... */ }
     // ... implement all methods from CacheAdapter interface
   }
   ```

2. **Implement interface** from [adapter.ts](apps/cache-service/src/lib/cache/adapter.ts):
   - Basic: `get`, `set`, `del`, `exists`, `flush`
   - LFU support: `zadd`, `zincrby`, `zrevrange`, `zrange` (sorted sets)
   - LFU support: `sadd`, `smembers`, `srem` (regular sets)

3. **Register in module** ([cache/module.ts](apps/cache-service/src/lib/cache/module.ts)):
   ```typescript
   {
     provide: CacheAdapter,
     useFactory: (configService: ConfigService) => {
       const type = configService.get('CACHE_ADAPTER', 'redis');
       if (type === 'memcached') return new MemcachedAdapter(configService);
       // ...
     }
   }
   ```

4. **Update `.env.example`**:
   ```bash
   CACHE_ADAPTER=memcached  # or redis, dragonfly
   MEMCACHED_HOST=memcached
   MEMCACHED_PORT=11211
   ```

### Testing Strategy

- Unit tests use Jest with shared presets from `@daap/jest-presets`
- Services should mock external dependencies
- Use `--detectOpenHandles` flag for async cleanup
- Integration tests available via `pnpm test:integration`

## Important Notes

### Monorepo Workspace References

All internal dependencies use `workspace:*` protocol. When adding dependencies between packages:
```json
{
  "dependencies": {
    "@daap/schema": "workspace:*"
  }
}
```

### Turborepo Pipeline

Build pipeline respects dependencies via `dependsOn: ["^build"]` in `turbo.json`. This ensures packages are built before dependent services.

### NestJS Module Organization

Services use modular architecture:
- Health checks in `modules/health/`
- Feature-specific logic in `modules/{feature}/`
- Reusable libraries in `lib/`

### Performance Evaluation

The project includes performance benchmarking documented in `RESULTS.md`. When making cache changes, re-run performance tests to validate improvements.

### Port Assignments

Development ports (customizable via env):
- 3001: Reviews Service
- 3002: Cache Service
- 3003: Search Service
- 6379: Redis
- 6380: Dragonfly
- 27017: MongoDB
- 8080: Traefik Dashboard

## API Contracts (Integration Points)

### Reviews Service (Port 3001)

**Search endpoint**:
```http
GET http://reviews.localhost/search?q={query}&page={page}&size={size}
```

**Response**:
```typescript
interface SearchResult {
  items: Review[];      // MongoDB documents
  total: number;        // Total matching documents
  page: number;
  size: number;
  source: 'cache' | 'search' | 'search-direct';  // Origin indicator
}
```

### Cache Service (Port 3002)

**Search with cache**:
```http
GET http://cache.localhost/search?q={query}&page={page}&size={size}
```

**Cache management**:
```http
DELETE http://cache.localhost/cache/invalidate?q={query}  # Query-specific
DELETE http://cache.localhost/cache/invalidate            # Full flush
```

**LFU statistics**:
```http
GET http://cache.localhost/cache/statistics    # Full LFU stats
GET http://cache.localhost/cache/info          # Cache info + utilization
GET http://cache.localhost/cache/keywords?limit=50  # Top keywords
```

### Search Service (Port 3003)

**Direct MongoDB search**:
```http
GET http://search.localhost/search?q={query}&page={page}&size={size}
```

**Note**: Uses MongoDB `$text` search. Indexes commented in [review.schema.ts:44-58](packages/schema/src/reviews/review.schema.ts#L44-L58).

### Review Schema (MongoDB)

```typescript
interface Review {
  reviewerID: string;
  asin: string;           // Product ID (Amazon Standard ID)
  reviewerName: string;
  helpful: number[];      // [helpful_votes, total_votes]
  reviewText: string;     // Full review text (searchable)
  overall: number;        // Rating 1-5
  summary: string;        // Review title (searchable)
  unixReviewTime: number;
  reviewTime: string;     // Human-readable date
  category: string;
  class: number;
}
```

## Troubleshooting

### Cache Not Working?

**Symptoms**: All responses show `source: 'search'` instead of `source: 'cache'`

**Diagnosis**:
```bash
# 1. Check Cache Service is running
docker-compose logs cache-service | grep "LFU Manager initialized"

# 2. Test cache endpoint directly
curl "http://cache.localhost/search?q=laptop&page=1&size=10"

# 3. Verify Redis has data
docker exec -it daap-redis redis-cli KEYS "search:*"
docker exec -it daap-redis redis-cli GET "search:laptop:1:10"
```

**Common causes**:
- Cache Service not started
- Redis/Dragonfly connection failed (check `CACHE_ADAPTER`, `REDIS_HOST`)
- TTL expired (check `CACHE_TTL` in env, default 4 days)

### Reviews Service Returns `source: 'search-direct'`?

**Meaning**: Cache Service is unreachable, using fallback to Search Service

**Check**:
```bash
# Verify Cache Service is up
docker ps | grep cache-service

# Check network connectivity
docker exec -it daap-reviews-service ping cache-service

# Verify CACHE_SERVICE_URL uses internal Docker name
echo $CACHE_SERVICE_URL  # Should be http://cache-service:3002
```

### Eviction Not Happening?

**Symptoms**: Cache keeps growing, no eviction logs

**Check**:
```bash
# View current cache size
curl http://cache.localhost/cache/info

# Check configuration
echo $LFU_MAX_ENTRIES        # Default: 1000
echo $LFU_EVICTION_BATCH_SIZE  # Default: 50

# Watch for eviction logs
docker-compose logs -f cache-service | grep "Evicting"
```

**Expected behavior**: When entries > `LFU_MAX_ENTRIES`, should see:
```
Cache limit exceeded: 1050/1000. Evicting 50 entries...
```

### MongoDB Returns No Results?

**Causes**:
1. **Database not populated**: Import reviews dataset
2. **Text indexes disabled**: Uncomment indexes in [review.schema.ts:44-58](packages/schema/src/reviews/review.schema.ts#L44-L58)
3. **Wrong query syntax**: MongoDB `$text` search requires exact terms

**Verify**:
```bash
# Check database has data
docker exec -it daap-mongodb mongosh -u admin -p admin --authenticationDatabase admin
> use daap
> db.reviews.countDocuments()  # Should be > 0
> db.reviews.find({reviewText: /laptop/i}).limit(1)  # Regex search works
```

### Build Issues

**Turbo cache corruption**:
```bash
pnpm clean
rm -rf node_modules .turbo
pnpm install
pnpm build
```

**Docker build fails**:
```bash
# Clear Docker cache
docker-compose down -v
docker system prune -af
docker-compose up -d --build
```

### Network Issues (Services Can't Communicate)

**Checklist**:
- ✅ All services on `app_network` (check [docker-compose.yml:145](docker-compose.yml#L145))
- ✅ Use internal Docker names: `http://cache-service:3002` (NOT `localhost`)
- ✅ Traefik labels configured correctly
- ✅ Health checks passing: `docker ps` shows "healthy" status

**Debug**:
```bash
# Inspect network
docker network inspect daap_app_network

# Test connectivity from Reviews Service
docker exec -it daap-reviews-service curl http://cache-service:3002/health
```
