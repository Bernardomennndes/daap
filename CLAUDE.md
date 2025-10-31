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
- `@daap/telemetry`: **OpenTelemetry instrumentation** (SDK, tracing, context propagation)
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

---

## Observability & Distributed Tracing (OpenTelemetry + Jaeger)

O sistema implementa **distributed tracing completo** usando OpenTelemetry + Jaeger para observabilidade end-to-end.

### **Architecture Overview**

```
User Request
    ↓
Reviews Service (Port 3001)
    │ [Span: GET /search]
    │ [Auto-instrumentation: HTTP]
    ↓
Cache Service (Port 3002)
    │ [Span: cache.get]
    │ ├─ [Span: cache.lookup.normalized]
    │ ├─ [Span: cache.lookup.fuzzy]
    │ └─ [Span: http.client.search_service]
    ↓
Search Service (Port 3003)
    │ [Span: search.mongodb_query]
    │ [Auto-instrumentation: MongoDB]
    ↓
MongoDB
```

**Trace Context Propagation**: Trace IDs são propagados via HTTP headers (`traceparent`, `tracestate`) entre todos os serviços.

### **Telemetry Package** (`@daap/telemetry`)

Package compartilhado que centraliza toda a instrumentação OpenTelemetry:

**Estrutura**:
```
packages/telemetry/
├── src/
│   ├── sdk.ts                    # NodeSDK bootstrap + auto-instrumentations
│   ├── tracer.ts                 # TracingService (singleton)
│   ├── context-propagation.ts    # HTTP header injection/extraction
│   ├── constants.ts              # Semantic conventions customizadas
│   └── index.ts                  # Exports
└── dist/                         # Compiled output
```

**Capabilities**:
- ✅ Auto-instrumentação de HTTP (Express + Axios)
- ✅ Auto-instrumentação de MongoDB (queries, agregações)
- ✅ Auto-instrumentação de NestJS core
- ✅ Context propagation via HTTP headers
- ✅ Custom spans para operações de negócio
- ✅ Semantic attributes para métricas

### **Instrumentation Points**

#### **Reviews Service**
- **Auto-instrumentation**: HTTP requests/responses
- **Context Propagation**: Injeta trace context em todas as requisições para Cache Service
- **Location**: [apps/reviews-service/src/tracing.ts](apps/reviews-service/src/tracing.ts)

#### **Cache Service** (instrumentação mais intensiva)
- **Custom Spans**:
  - `cache.get`: Busca no cache (normalized → fuzzy → miss)
  - `cache.lookup.normalized`: Busca com query normalizada
  - `cache.lookup.fuzzy`: Fuzzy matching (Jaccard similarity)
  - `cache.set`: Armazenamento no cache
  - `cache.eviction.check`: Verificação de eviction
  - `http.client.search_service`: Chamada para Search Service
- **Semantic Attributes**:
  - `cache.hit_type`: normalized | fuzzy | miss
  - `cache.query`, `cache.page`, `cache.size`
  - `cache.fuzzy.similarity`: Score de similaridade (0.0-1.0)
  - `keyword.count`: Número de keywords extraídas
- **Location**: [apps/cache-service/src/modules/cache/service.ts](apps/cache-service/src/modules/cache/service.ts)

#### **Search Service**
- **Custom Span**:
  - `search.mongodb_query`: Query MongoDB com $text search
- **Semantic Attributes**:
  - `search.query`: Query de busca
  - `search.results.total`: Total de resultados
  - `search.results.returned`: Resultados retornados (com paginação)
  - `mongodb.collection`: Nome da collection (reviews)
- **Auto-instrumentation**: MongoDB queries (find, countDocuments)
- **Location**: [apps/search-service/src/modules/search/service.ts](apps/search-service/src/modules/search/service.ts)

### **Jaeger UI**

**Access**: http://localhost:16686 (quando rodando via Docker Compose)

**Como usar**:
```bash
# 1. Subir ambiente completo
docker-compose up -d --build

# 2. Fazer requisições
curl "http://reviews.localhost/search?q=laptop&page=1&size=10"

# 3. Abrir Jaeger UI
open http://localhost:16686

# 4. Buscar traces:
#    Service: reviews-service
#    Operation: GET /search
#    Click "Find Traces"
```

**Exemplo de Trace (Cache Miss)**:
```
Trace ID: abc123def456
Duration: 7580ms

reviews-service: GET /search (7580ms)
  └─ http.client → cache-service (7575ms)
      └─ cache.get (7570ms)
          ├─ cache.lookup.normalized (2ms) [cache.hit=false]
          ├─ cache.lookup.fuzzy (8ms) [cache.hit=false]
          └─ http.client.search_service (7550ms)
              └─ search.mongodb_query (7545ms)
                  ├─ mongodb.find (3800ms)
                  └─ mongodb.countDocuments (3745ms)
```

**Exemplo de Trace (Cache Hit)**:
```
Trace ID: xyz789ghi012
Duration: 8ms  ← 99.9% MAIS RÁPIDO!

reviews-service: GET /search (8ms)
  └─ http.client → cache-service (7ms)
      └─ cache.get (5ms)
          └─ cache.lookup.normalized (3ms) [cache.hit=true, cache.hit_type=normalized]
```

### **Semantic Conventions Customizadas**

**Cache Operations** ([constants.ts](packages/telemetry/src/constants.ts)):
- `cache.operation`: get | set | invalidate
- `cache.key`: Chave do cache (ex: `search:laptop:1:10`)
- `cache.hit`: Boolean (true/false)
- `cache.hit_type`: normalized | fuzzy | miss
- `cache.query`: Query original do usuário
- `cache.page`, `cache.size`: Paginação
- `cache.fuzzy.similarity`: Score Jaccard (0.0-1.0)
- `cache.fuzzy.candidates`: Número de candidatos avaliados

**Eviction Operations**:
- `eviction.strategy`: lfu | lru | hybrid
- `eviction.entries.count`: Total de entries no cache
- `eviction.entries.evicted`: Número de entries removidos
- `eviction.score.min`, `eviction.score.max`: Range de scores

**Search Operations**:
- `search.query`: Query de busca
- `search.results.total`: Total de resultados encontrados
- `search.results.returned`: Resultados retornados (paginação)
- `mongodb.collection`: Nome da collection
- `mongodb.operation`: find | countDocuments | aggregate

**Keywords**:
- `keyword.count`: Número de keywords extraídas
- `keyword.extraction.method`: porter | stopwords

### **Trace Filtering & Analysis**

**Queries úteis no Jaeger UI**:

```
# Apenas cache misses
Tag: cache.hit_type=miss

# Apenas hits normalizados
Tag: cache.hit_type=normalized

# Apenas fuzzy matches
Tag: cache.hit_type=fuzzy

# Traces lentos (> 1 segundo)
Min Duration: 1000ms

# Por query específica
Tag: cache.query=laptop

# Taxa de cache hit
Group by: cache.hit_type
```

### **Environment Variables** (OpenTelemetry)

**Configuração** (`.env`):
```bash
# Jaeger OTLP endpoint (gRPC)
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317

# Sampling strategy
# Options: always_on, always_off, traceidratio, parentbased_always_on
OTEL_TRACES_SAMPLER=always_on

# Sampling ratio (para traceidratio)
# 0.1 = 10% sampling, 1.0 = 100% sampling
OTEL_TRACES_SAMPLER_ARG=1.0

# Log level do SDK
OTEL_LOG_LEVEL=info

# Node environment
NODE_ENV=development
```

**Para Produção** (reduzir overhead):
```bash
# Coletar apenas 10% dos traces
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

### **Usage Patterns**

#### **Creating Custom Spans**

```typescript
import { getTracingService } from '@daap/telemetry';

export class MyService {
  private readonly tracing = getTracingService('my-service');

  async myOperation() {
    return this.tracing.startActiveSpan('operation.name', async (span) => {
      // Adicionar attributes
      span.setAttributes({
        'custom.attribute': 'value',
        'custom.count': 42,
      });

      try {
        const result = await this.doWork();

        // Adicionar evento
        span.addEvent('work_completed', {
          'result.count': result.length,
        });

        return result;
      } catch (error) {
        // Erro é automaticamente capturado
        throw error;
      }
      // Span é automaticamente finalizado
    });
  }
}
```

#### **Context Propagation (HTTP Calls)**

```typescript
import { injectTraceContext } from '@daap/telemetry';

// Em HttpService ou interceptor Axios
const headers = injectTraceContext({}); // Injeta traceparent/tracestate

axios.get('http://service:3000/endpoint', { headers });
```

#### **Getting Current Trace ID** (para logs correlacionados)

```typescript
import { getTracingService } from '@daap/telemetry';

const tracing = getTracingService('my-service');
const traceId = tracing.getCurrentTraceId();

console.log(`[TraceID: ${traceId}] Processing request...`);
```

### **Performance Impact**

**Overhead medido**:
- Auto-instrumentation HTTP: ~0.1-0.5ms por request
- Custom spans: ~0.05ms por span
- MongoDB instrumentation: ~0.2ms por query
- **Total overhead**: < 1ms em média (negligível vs 8ms cache hit / 7580ms cache miss)

**Sampling recomendado para produção**:
- Development: 100% (sempre_on)
- Staging: 50% (traceidratio=0.5)
- Production: 10% (traceidratio=0.1)

### **Troubleshooting Traces**

#### **Traces não aparecem no Jaeger**

```bash
# 1. Verificar se Jaeger está rodando
docker ps | grep jaeger

# 2. Ver logs de inicialização do OpenTelemetry
docker-compose logs reviews-service | grep OpenTelemetry
docker-compose logs cache-service | grep OpenTelemetry
docker-compose logs search-service | grep OpenTelemetry

# Esperado: "[OpenTelemetry] Initialized for service: {service-name}"

# 3. Verificar conectividade com Jaeger
docker exec daap-reviews-service ping jaeger

# 4. Verificar variáveis de ambiente
docker exec daap-reviews-service env | grep OTEL
```

#### **Traces incompletos (spans faltando)**

**Causa**: Context propagation não funcionando

**Verificação**:
```typescript
// Certifique-se que HttpService usa injectTraceContext()
// Location: apps/reviews-service/src/lib/modules/http/service.ts

instance.interceptors.request.use((requestConfig) => {
  const tracedHeaders = injectTraceContext(requestConfig.headers || {});
  requestConfig.headers = { ...requestConfig.headers, ...tracedHeaders };
  return requestConfig;
});
```

#### **Latências incorretas**

**Sintoma**: Spans mostram tempo 0ms ou valores inconsistentes

**Causa**: Spans sendo finalizados antes da operação completar

**Solução**: Sempre usar `startActiveSpan()` com async/await:
```typescript
// ✅ CORRETO
return this.tracing.startActiveSpan('operation', async (span) => {
  const result = await asyncOperation();
  return result; // Span finaliza automaticamente
});

// ❌ ERRADO
this.tracing.startActiveSpan('operation', async (span) => {
  asyncOperation(); // Sem await!
  return; // Span finaliza antes da operação completar
});
```

### **Documentation**

- **Implementation Guide**: [OPENTELEMETRY_IMPLEMENTATION_COMPLETE.md](OPENTELEMETRY_IMPLEMENTATION_COMPLETE.md)
- **Telemetry Package**: [packages/telemetry/](packages/telemetry/)
- **OpenTelemetry JS Docs**: https://opentelemetry.io/docs/instrumentation/js/
- **Jaeger Documentation**: https://www.jaegertracing.io/docs/

---

## Strategy Comparison Tool

**Location**: [packages/tools/strategy-comparison/](packages/tools/strategy-comparison/)

Ferramenta automatizada para comparar as três estratégias de eviction (LFU, LRU, Hybrid) através de métricas coletadas via **OpenTelemetry + Jaeger**.

### **Quick Start**

```bash
# Rodar teste automatizado completo (testa as 3 estratégias sequencialmente)
./packages/tools/strategy-comparison/run-comparison-test.sh 5000 10

# Argumentos:
#   $1: Número de requests por estratégia (default: 5000)
#   $2: Concurrency (default: 10)

# Tempo estimado: ~20-30 minutos
```

**Output**:
- `packages/tools/results/comparison-report-*.md` - Relatório Markdown
- `packages/tools/results/comparison-report-*.csv` - Relatório CSV
- `packages/tools/results/traces/` - JSONs brutos do Jaeger

### **Métricas Coletadas**

Por estratégia:
- Total de evictions executadas
- Duração média/min/max/P50/P95/P99 (ms)
- Entries evictadas (média/total)
- Score médio das entries evictadas
- Utilização antes/depois (%)
- Eficiência (entries/ms)

### **Workflow Manual**

```bash
# 1. Rodar testes com estratégia específica
echo "EVICTION_STRATEGY=lfu" >> .env
docker-compose up -d --build cache-service
cd packages/tools/load-testing
pnpm test:bulk 5000 10

# 2. Coletar traces do Jaeger
cd ../strategy-comparison
npx ts-node jaeger-collector.ts lfu 1 1000

# 3. Gerar relatório comparativo (após coletar todas as estratégias)
npx ts-node compare-strategies.ts 1
```

### **Visualização no Jaeger UI**

```
http://localhost:16686

Filtros úteis:
- Service: cache-service
- Operation: cache.eviction.check
- Tags: eviction.strategy=lfu (ou lru, hybrid)
- Tags: eviction.triggered=true (apenas evictions reais)
```

### **Documentação Completa**

- [README completo](packages/tools/strategy-comparison/README.md)
- [Troubleshooting & Advanced Usage](packages/tools/strategy-comparison/README.md#troubleshooting)

---

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
- 16686: Jaeger UI
- 4317: Jaeger OTLP gRPC receiver
- 4318: Jaeger OTLP HTTP receiver

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
