# Cache Eviction Strategies

## Table of Contents
- [Overview](#overview)
- [Strategy Architecture](#strategy-architecture)
- [LFU Strategy](#lfu-strategy-least-frequently-used)
- [LRU Strategy](#lru-strategy-least-recently-used)
- [Hybrid Strategy](#hybrid-strategy)
- [Strategy Comparison](#strategy-comparison)
- [Configuration Guide](#configuration-guide)
- [Performance Analysis](#performance-analysis)

## Overview

The DAAP cache system implements **three pluggable eviction strategies** that determine which cache entries to remove when the cache reaches capacity. Each strategy optimizes for different access patterns and use cases.

### Design Principle

All strategies implement a common interface, allowing **runtime switching via environment variables** without code changes:

```typescript
interface EvictionStrategy {
  registerCacheEntry(key: string, keywords: string[], size: number): Promise<void>;
  checkAndEvict(): Promise<void>;
  getCacheInfo(): Promise<CacheInfo>;
}
```

**Key Feature**: Pluggable architecture (Strategy Pattern)

## Strategy Architecture

```mermaid
classDiagram
    class EvictionStrategy {
        <<interface>>
        +registerCacheEntry(key, keywords, size)*
        +checkAndEvict()*
        +getCacheInfo()*
        +recordAccess(key)*
        +invalidate(key)*
    }

    class BaseLFUManager {
        #cacheAdapter: CacheAdapter
        #keywordService: KeywordService
        #tracer: TracingService
        #config: EvictionConfig
        +registerCacheEntry(key, keywords, size)
        +getCacheInfo()
        +recordAccess(key)
        +invalidate(key)
    }

    class LFUStrategy {
        +checkAndEvict()
        -calculateEvictionScore(metadata)
        -findEntriesForEviction()
        -evictEntries(entries)
    }

    class LRUStrategy {
        +checkAndEvict()
        -calculateEvictionScore(metadata)
        -findEntriesForEviction()
        -evictEntries(entries)
    }

    class HybridStrategy {
        #frequencyWeight: number
        #recencyWeight: number
        +checkAndEvict()
        -calculateEvictionScore(metadata)
        -findEntriesForEviction()
        -evictEntries(entries)
    }

    EvictionStrategy <|.. BaseLFUManager
    BaseLFUManager <|-- LFUStrategy
    BaseLFUManager <|-- LRUStrategy
    BaseLFUManager <|-- HybridStrategy

    class CacheService {
        -strategy: EvictionStrategy
        +get(query, page, size)
        +set(query, page, size, data)
    }

    CacheService --> EvictionStrategy : usa

    class CacheAdapter {
        <<interface>>
        +get(key)*
        +set(key, value, ttl)*
        +del(key)*
        +zadd(key, score, member)*
        +zincrby(key, increment, member)*
    }

    BaseLFUManager --> CacheAdapter : usa
    BaseLFUManager --> KeywordService : usa
    BaseLFUManager --> TracingService : usa

    style EvictionStrategy fill:#e1f5ff
    style BaseLFUManager fill:#fff4e1
    style LFUStrategy fill:#e1ffe1
    style LRUStrategy fill:#f4e1ff
    style HybridStrategy fill:#ffe1f4
```

### Strategy Selection

**Configuration** (`.env`):
```bash
EVICTION_STRATEGY=lfu  # Options: lfu, lru, hybrid
```

**Factory Pattern** ([cache/module.ts](../apps/cache-service/src/lib/cache/module.ts)):
```typescript
{
  provide: 'EVICTION_STRATEGY',
  useFactory: (
    adapter: CacheAdapter,
    keywordService: KeywordService,
    config: ConfigService,
  ) => {
    const strategy = config.get('EVICTION_STRATEGY', 'lfu');

    switch (strategy) {
      case 'lru':
        return new LRUStrategy(adapter, keywordService, config);
      case 'hybrid':
        return new HybridStrategy(adapter, keywordService, config);
      default:
        return new LFUStrategy(adapter, keywordService, config);
    }
  },
  inject: [CacheAdapter, KeywordService, ConfigService],
}
```

## LFU Strategy (Least Frequently Used)

**Principle**: Remove entries with the **lowest access frequency**, factoring in age.

**Best For**:
- Workloads with **popular repeated queries** (e.g., trending products)
- Long-running caches where frequency converges
- Scenarios where "hot" data should stay cached

### Eviction Score Formula

```typescript
const timeSinceAccess = Date.now() - metadata.lastAccess;
const ageInHours = timeSinceAccess / (1000 * 60 * 60);
const score = (1 / (metadata.frequency + 1)) + (ageInHours * 0.1);
```

**Logic**:
- **Higher score** = **worse** = evict first
- Frequency component: `1 / (freq + 1)` → low frequency = high score
- Age component: `age_hours * 0.1` → older entries get higher score
- Age is a tiebreaker when frequencies are similar

### Score Calculation Examples

```mermaid
graph LR
    subgraph "Alta prioridade (manter)"
        A[Entrada A<br/>freq=100, age=1h<br/>score = 0.01 + 0.1 = 0.11]
        B[Entrada B<br/>freq=50, age=2h<br/>score = 0.02 + 0.2 = 0.22]
    end

    subgraph "Prioridade média"
        C[Entrada C<br/>freq=10, age=5h<br/>score = 0.09 + 0.5 = 0.59]
        D[Entrada D<br/>freq=5, age=10h<br/>score = 0.17 + 1.0 = 1.17]
    end

    subgraph "Baixa prioridade (remover)"
        E[Entrada E<br/>freq=2, age=20h<br/>score = 0.33 + 2.0 = 2.33]
        F[Entrada F<br/>freq=1, age=48h<br/>score = 0.50 + 4.8 = 5.30]
    end

    style A fill:#e1ffe1
    style B fill:#e1ffe1
    style C fill:#fff4e1
    style D fill:#fff4e1
    style E fill:#ffe1e1
    style F fill:#ffe1e1
```

### LFU Eviction Flow

```mermaid
sequenceDiagram
    participant CS as Cache Service
    participant LFU as LFU Strategy
    participant Redis as Redis/Dragonfly
    participant Jaeger as Jaeger

    CS->>LFU: checkAndEvict()
    activate LFU

    LFU->>Redis: SCARD cache:entries
    Redis-->>LFU: count=1050

    alt count > MAX_ENTRIES (1000)
        Note over LFU: Iniciar span: cache.eviction.check

        LFU->>Redis: SMEMBERS cache:entries
        Redis-->>LFU: [key1, key2, ..., key1050]

        loop Para cada chave
            LFU->>Redis: HGETALL cache:meta:{key}
            Redis-->>LFU: {frequency, lastAccess, size, keywords}
            LFU->>LFU: Calcular score:<br/>1/(freq+1) + age*0.1
        end

        LFU->>LFU: Ordenar por score (DESC)
        LFU->>LFU: Selecionar primeiros BATCH_SIZE (50)

        loop Para cada entrada a remover
            LFU->>Redis: DEL search:{query}:{page}:{size}
            LFU->>Redis: DEL cache:meta:{key}
            LFU->>Redis: SREM cache:entries {key}
            LFU->>Redis: SREM keyword:keys:{keyword} {key}
            LFU->>Redis: ZINCRBY keywords:ranking -1 {keyword}
        end

        LFU->>Jaeger: Emit span:<br/>eviction.strategy=lfu<br/>eviction.entries.evicted=50<br/>eviction.score.avg=2.34

        LFU-->>CS: 50 entradas removidas
    else count <= MAX_ENTRIES
        LFU-->>CS: Nenhuma remoção necessária
    end

    deactivate LFU
```

### LFU Implementation

**Location**: [apps/cache-service/src/lib/cache/strategies/lfu.strategy.ts](../apps/cache-service/src/lib/cache/strategies/lfu.strategy.ts)

**Key Methods**:

```typescript
private calculateEvictionScore(metadata: CacheEntryMetadata): number {
  const timeSinceAccess = Date.now() - metadata.lastAccess;
  const ageInHours = timeSinceAccess / (1000 * 60 * 60);

  // Lower frequency + older age = higher score = worse = evict first
  return (1 / (metadata.frequency + 1)) + (ageInHours * 0.1);
}

private async findEntriesForEviction(): Promise<EvictionCandidate[]> {
  const allKeys = await this.cacheAdapter.smembers('cache:entries');
  const candidates: EvictionCandidate[] = [];

  for (const key of allKeys) {
    const metadata = await this.getCacheEntryMetadata(key);
    if (!metadata) continue;

    const score = this.calculateEvictionScore(metadata);
    candidates.push({ key, score, metadata });
  }

  // Sort DESC: highest score = worst = evict first
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, this.config.EVICTION_BATCH_SIZE);
}
```

## LRU Strategy (Least Recently Used)

**Principle**: Remove entries that haven't been accessed for the **longest time**, ignoring frequency.

**Best For**:
- **Time-sensitive data** (news, stock prices)
- Workloads with **shifting patterns** (seasonal products)
- Scenarios where recency matters more than popularity

### Eviction Score Formula

```typescript
const timeSinceAccess = Date.now() - metadata.lastAccess;
const score = timeSinceAccess; // Milliseconds since last access
```

**Logic**:
- **Higher score** = **older** = evict first
- Frequency is **completely ignored**
- Pure time-based eviction

### Score Calculation Examples

```mermaid
graph LR
    subgraph "Alta prioridade (manter)"
        A[Entrada A<br/>lastAccess=há 2 min<br/>score = 120000 ms]
        B[Entrada B<br/>lastAccess=há 10 min<br/>score = 600000 ms]
    end

    subgraph "Prioridade média"
        C[Entrada C<br/>lastAccess=há 1 hora<br/>score = 3600000 ms]
        D[Entrada D<br/>lastAccess=há 6 horas<br/>score = 21600000 ms]
    end

    subgraph "Baixa prioridade (remover)"
        E[Entrada E<br/>lastAccess=há 1 dia<br/>score = 86400000 ms]
        F[Entrada F<br/>lastAccess=há 3 dias<br/>score = 259200000 ms]
    end

    style A fill:#e1ffe1
    style B fill:#e1ffe1
    style C fill:#fff4e1
    style D fill:#fff4e1
    style E fill:#ffe1e1
    style F fill:#ffe1e1
```

### LRU vs LFU Comparison

**Scenario**: Two cache entries competing for eviction

| Entry | Frequency | Last Access | LFU Score | LRU Score | LFU Decision | LRU Decision |
|-------|-----------|-------------|-----------|-----------|--------------|--------------|
| **A** | 100 | 7 days ago | 0.01 + 168*0.1 = **16.81** | 604800000 | Evict | Evict |
| **B** | 1 | 1 hour ago | 0.50 + 1*0.1 = **0.60** | 3600000 | Keep | Keep |
| **C** | 50 | 3 days ago | 0.02 + 72*0.1 = **7.22** | 259200000 | Evict | Evict |
| **D** | 2 | 2 days ago | 0.33 + 48*0.1 = **5.13** | 172800000 | Evict | Keep (if B evicted) |

**Key Insight**: LRU evicts **D** before **B**, even though **B** has lower frequency, because **D** is older.

### LRU Implementation

**Location**: [apps/cache-service/src/lib/cache/strategies/lru.strategy.ts](../apps/cache-service/src/lib/cache/strategies/lru.strategy.ts)

```typescript
private calculateEvictionScore(metadata: CacheEntryMetadata): number {
  const timeSinceAccess = Date.now() - metadata.lastAccess;
  // Higher score = older = evict first
  return timeSinceAccess;
}
```

## Hybrid Strategy

**Principle**: **Weighted combination** of LFU and LRU, balancing frequency and recency.

**Best For**:
- **Mixed workloads** (popular + trending queries)
- General-purpose caching with no clear access pattern
- Tunable performance (adjust weights)

### Eviction Score Formula

```typescript
const frequencyScore = 1 / (metadata.frequency + 1);
const ageInHours = (Date.now() - metadata.lastAccess) / (1000 * 60 * 60);
const recencyScore = ageInHours * 0.1;

const score =
  (EVICTION_FREQUENCY_WEIGHT * frequencyScore) +
  (EVICTION_RECENCY_WEIGHT * recencyScore);
```

**Default Weights**:
- `EVICTION_FREQUENCY_WEIGHT = 0.6` (60% frequency)
- `EVICTION_RECENCY_WEIGHT = 0.4` (40% recency)

**Logic**:
- **Higher weight** on frequency → behaves more like LFU
- **Higher weight** on recency → behaves more like LRU
- Weights must sum to 1.0

### Weight Tuning

```mermaid
flowchart TD
    Start([Configurar pesos]) --> Choice{Tipo de carga?}

    Choice -->|Consultas populares repetidas| HighFreq[Frequência: 0.7-0.8<br/>Recência: 0.2-0.3<br/>Comporta-se como LFU]

    Choice -->|Dados sensíveis a tempo| HighRecency[Frequência: 0.2-0.3<br/>Recência: 0.7-0.8<br/>Comporta-se como LRU]

    Choice -->|Mista/desconhecida| Balanced[Frequência: 0.5-0.6<br/>Recência: 0.4-0.5<br/>Abordagem equilibrada]

    HighFreq --> Test[Executar testes de carga]
    HighRecency --> Test
    Balanced --> Test

    Test --> Measure{Taxa de acertos satisfatória?}

    Measure -->|Sim| Deploy[Publicar em produção]
    Measure -->|Não| Tune[Ajustar pesos]

    Tune --> Test

    Deploy --> Monitor[Monitorar métricas<br/>Prometheus + Jaeger]

    style Start fill:#e1f5ff
    style Deploy fill:#e1ffe1
    style Test fill:#fff4e1
    style Tune fill:#ffe1e1
```

### Score Calculation Examples

**Weights**: 60% frequency, 40% recency

| Entry | Frequency | Age (hours) | Freq Score | Recency Score | **Hybrid Score** | Priority |
|-------|-----------|-------------|------------|---------------|------------------|----------|
| **A** | 100 | 1 | 0.0099 | 0.1 | 0.0099*0.6 + 0.1*0.4 = **0.046** | Keep |
| **B** | 50 | 6 | 0.0196 | 0.6 | 0.0196*0.6 + 0.6*0.4 = **0.252** | Keep |
| **C** | 10 | 24 | 0.0909 | 2.4 | 0.0909*0.6 + 2.4*0.4 = **1.015** | Medium |
| **D** | 5 | 48 | 0.1667 | 4.8 | 0.1667*0.6 + 4.8*0.4 = **2.020** | Evict |
| **E** | 1 | 72 | 0.5000 | 7.2 | 0.5000*0.6 + 7.2*0.4 = **3.180** | Evict |

### Hybrid Implementation

**Location**: [apps/cache-service/src/lib/cache/strategies/hybrid.strategy.ts](../apps/cache-service/src/lib/cache/strategies/hybrid.strategy.ts)

```typescript
export class HybridStrategy extends BaseLFUManager {
  private readonly frequencyWeight: number;
  private readonly recencyWeight: number;

  constructor(
    cacheAdapter: CacheAdapter,
    keywordService: KeywordService,
    config: ConfigService,
  ) {
    super(cacheAdapter, keywordService, config);

    this.frequencyWeight = parseFloat(config.get('EVICTION_FREQUENCY_WEIGHT', '0.6'));
    this.recencyWeight = parseFloat(config.get('EVICTION_RECENCY_WEIGHT', '0.4'));

    // Validate weights sum to 1.0
    if (Math.abs(this.frequencyWeight + this.recencyWeight - 1.0) > 0.001) {
      throw new Error('Frequency and recency weights must sum to 1.0');
    }
  }

  private calculateEvictionScore(metadata: CacheEntryMetadata): number {
    const frequencyScore = 1 / (metadata.frequency + 1);

    const timeSinceAccess = Date.now() - metadata.lastAccess;
    const ageInHours = timeSinceAccess / (1000 * 60 * 60);
    const recencyScore = ageInHours * 0.1;

    // Weighted combination
    return (this.frequencyWeight * frequencyScore) +
           (this.recencyWeight * recencyScore);
  }
}
```

## Strategy Comparison

### Decision Matrix

```mermaid
graph TB
    Start([Escolher estratégia de remoção]) --> Q1{Padrão de acesso?}

    Q1 -->|Consultas populares repetidas| Q2{Frequência estável?}
    Q1 -->|Dados sensíveis a tempo| LRU[Usar estratégia LRU]
    Q1 -->|Mista/desconhecida| Hybrid[Usar estratégia Hybrid]

    Q2 -->|Sim, converge| LFU[Usar estratégia LFU]
    Q2 -->|Não, variando| Hybrid2[Usar estratégia Hybrid<br/>Peso elevado de recência]

    LFU --> Config1[EVICTION_STRATEGY=lfu<br/>EVICTION_MAX_ENTRIES=1000<br/>EVICTION_BATCH_SIZE=50]

    LRU --> Config2[EVICTION_STRATEGY=lru<br/>EVICTION_MAX_ENTRIES=1000<br/>EVICTION_BATCH_SIZE=50]

    Hybrid --> Config3[EVICTION_STRATEGY=hybrid<br/>EVICTION_FREQUENCY_WEIGHT=0.6<br/>EVICTION_RECENCY_WEIGHT=0.4]

    Hybrid2 --> Config4[EVICTION_STRATEGY=hybrid<br/>EVICTION_FREQUENCY_WEIGHT=0.3<br/>EVICTION_RECENCY_WEIGHT=0.7]

    Config1 --> Deploy[Implantar e monitorar]
    Config2 --> Deploy
    Config3 --> Deploy
    Config4 --> Deploy

    style Start fill:#e1f5ff
    style LFU fill:#e1ffe1
    style LRU fill:#f4e1ff
    style Hybrid fill:#ffe1f4
    style Hybrid2 fill:#ffe1f4
    style Deploy fill:#fff4e1
```

### Comparison Table

| Feature | LFU | LRU | Hybrid |
|---------|-----|-----|--------|
| **Primary Metric** | Access frequency | Last access time | Weighted combination |
| **Best For** | Popular repeated queries | Time-sensitive data | Mixed workloads |
| **Frequency Matters?** | Yes (primary) | No (ignored) | Yes (weighted) |
| **Recency Matters?** | Yes (tiebreaker) | Yes (primary) | Yes (weighted) |
| **Cache Hit Rate** | High for stable patterns | High for shifting patterns | Medium-high (balanced) |
| **Eviction Latency** | ~100-150ms | ~80-120ms | ~110-160ms |
| **Memory Overhead** | Medium | Low | Medium |
| **Tunable?** | No | No | **Yes** (weights) |
| **Cold Start** | Poor (frequency=0) | Good | Medium |
| **Long-Running** | Excellent | Poor (frequency lost) | Good |

### Performance Metrics (Sample Data)

**Test Setup**: 5000 requests, 10 concurrent, 1000 max entries

| Strategy | Total Evictions | Avg Duration (ms) | Entries/Eviction | Cache Hit Rate | Avg Response Time |
|----------|-----------------|-------------------|------------------|----------------|-------------------|
| **LFU** | 42 | 123 | 50 | **91%** | 730ms |
| **LRU** | 58 | 98 | 50 | 87% | 985ms |
| **Hybrid (0.6/0.4)** | 48 | 112 | 50 | **90%** | 760ms |
| **Hybrid (0.5/0.5)** | 51 | 108 | 50 | 89% | 830ms |
| **Hybrid (0.3/0.7)** | 55 | 102 | 50 | 88% | 910ms |

**Key Insight**: LFU achieves highest hit rate (91%) for workloads with repeated popular queries.

## Configuration Guide

### Environment Variables

```bash
# Required: Choose strategy
EVICTION_STRATEGY=lfu  # Options: lfu, lru, hybrid

# Required: Capacity limits
EVICTION_MAX_ENTRIES=1000        # Trigger eviction when exceeded
EVICTION_BATCH_SIZE=50           # Number of entries to evict at once

# Optional: Hybrid strategy weights (only for EVICTION_STRATEGY=hybrid)
EVICTION_FREQUENCY_WEIGHT=0.6    # Weight for frequency component (0.0-1.0)
EVICTION_RECENCY_WEIGHT=0.4      # Weight for recency component (0.0-1.0)
# Note: Weights must sum to 1.0

# Optional: Cache TTL
CACHE_TTL=345600                 # Seconds (4 days default)
```

### Switching Strategies

**Step 1**: Update `.env` file
```bash
# Change from LFU to Hybrid
EVICTION_STRATEGY=hybrid
EVICTION_FREQUENCY_WEIGHT=0.6
EVICTION_RECENCY_WEIGHT=0.4
```

**Step 2**: Restart Cache Service
```bash
docker-compose restart cache-service

# OR rebuild
docker-compose up -d --build cache-service
```

**Step 3**: Verify in logs
```bash
docker logs daap-cache-service | grep "Eviction Strategy"
# Expected: "[EvictionStrategy] Using strategy: HybridStrategy"
```

### Tuning Recommendations

#### LFU Strategy

**When to use**:
- E-commerce product search (popular items get repeated queries)
- Documentation/FAQ search (common questions dominate)
- API endpoints with power-law distribution (20% queries = 80% traffic)

**Tuning**:
```bash
EVICTION_STRATEGY=lfu

# Higher max entries = better hit rate (more memory)
EVICTION_MAX_ENTRIES=2000  # Default: 1000

# Smaller batch size = more frequent evictions (less latency spike)
EVICTION_BATCH_SIZE=25     # Default: 50
```

#### LRU Strategy

**When to use**:
- News/blog search (recent articles more popular)
- Social media search (trending topics)
- Time-series data (recent queries more relevant)

**Tuning**:
```bash
EVICTION_STRATEGY=lru

# Lower max entries = faster evictions (lower memory)
EVICTION_MAX_ENTRIES=500

# Larger batch size = fewer evictions (lower overhead)
EVICTION_BATCH_SIZE=100
```

#### Hybrid Strategy

**When to use**:
- General-purpose search (mixed access patterns)
- Unknown workload characteristics
- Need to balance frequency and recency

**Tuning for Popular Queries**:
```bash
EVICTION_STRATEGY=hybrid
EVICTION_FREQUENCY_WEIGHT=0.7  # Favor frequency
EVICTION_RECENCY_WEIGHT=0.3
```

**Tuning for Time-Sensitive Data**:
```bash
EVICTION_STRATEGY=hybrid
EVICTION_FREQUENCY_WEIGHT=0.3
EVICTION_RECENCY_WEIGHT=0.7    # Favor recency
```

## Performance Analysis

### Eviction Latency Breakdown

```mermaid
gantt
    title Linha do tempo do processo de remoção (LFU, 1000 entradas, lote de 50)
    dateFormat X
    axisFormat %L ms

    section Disparo
    Contar entradas (SCARD)         :0, 5

    section Seleção de candidatos
    Buscar todas as chaves (SMEMBERS) :5, 25
    Buscar metadados (1000x HGETALL)  :25, 95
    Calcular scores (in-memory)       :95, 105
    Ordenar por score (in-memory)     :105, 110

    section Remoção
    Remover entradas de cache (50x DEL) :110, 115
    Remover metadados (50x DEL)        :115, 118
    Remover de conjuntos (50x SREM)    :118, 120
    Atualizar ranking de keywords      :120, 123

    section Rastreamento
    Emitir span para o Jaeger       :123, 125
```

**Total Duration**: ~125ms (for 1000 entries, evicting 50)

**Optimization Opportunities**:
1. **Pipelining**: Batch Redis commands (DEL, SREM) → reduces to ~80ms
2. **Sampling**: Evaluate subset of entries (LRU-K algorithm) → reduces to ~40ms
3. **Async Eviction**: Background worker → no blocking

### Cache Hit Rate vs Max Entries

```mermaid
graph LR
    subgraph "Cache pequeno (500 entradas)"
        A1[Taxa de acertos: 82%]
        A2[Remoções: 85/teste]
        A3[Tempo médio de resposta: 1360ms]
    end

    subgraph "Cache médio (1000 entradas)"
        B1[Taxa de acertos: 91%]
        B2[Remoções: 42/teste]
        B3[Tempo médio de resposta: 730ms]
    end

    subgraph "Cache grande (2000 entradas)"
        C1[Taxa de acertos: 96%]
        C2[Remoções: 18/teste]
        C3[Tempo médio de resposta: 380ms]
    end

    A1 -.->|+9%| B1
    B1 -.->|+5%| C1

    A2 -.->|-51%| B2
    B2 -.->|-57%| C2

    A3 -.->|-46%| B3
    B3 -.->|-48%| C3

    style A1 fill:#ffe1e1
    style A2 fill:#ffe1e1
    style A3 fill:#ffe1e1
    style B1 fill:#fff4e1
    style B2 fill:#fff4e1
    style B3 fill:#fff4e1
    style C1 fill:#e1ffe1
    style C2 fill:#e1ffe1
    style C3 fill:#e1ffe1
```

**Key Insight**: Doubling cache size (500 → 1000) yields **+9% hit rate** and **-46% response time**. Diminishing returns beyond 2000 entries.

### Strategy Testing Tool

**Automated comparison** of all three strategies:

```bash
# Location: packages/tools/strategy-comparison/
./run-comparison-test.sh 5000 10

# Output: packages/tools/results/comparison-report-*.md
```

**Report Includes**:
- Total evictions per strategy
- Duration percentiles (P50, P95, P99)
- Entries evicted (avg, total)
- Average eviction score
- Utilization before/after
- Efficiency (entries/ms)

**Sample Report**:
```markdown
# Strategy Comparison Report

## LFU Strategy
- Total Evictions: 42
- Avg Duration: 123ms (P95: 187ms, P99: 245ms)
- Avg Entries Evicted: 50.2
- Avg Score: 2.34
- Utilization: 100% → 95%

## LRU Strategy
- Total Evictions: 58
- Avg Duration: 98ms (P95: 142ms, P99: 189ms)
- Avg Entries Evicted: 50.1
- Avg Score: 172800000 (48 hours)
- Utilization: 100% → 94%

## Hybrid Strategy (0.6/0.4)
- Total Evictions: 48
- Avg Duration: 112ms (P95: 165ms, P99: 218ms)
- Avg Entries Evicted: 50.0
- Avg Score: 1.87
- Utilization: 100% → 95%
```

## Next Steps

- [Observability](./05-observability.md) - Monitor evictions with Jaeger and Prometheus
- [Testing Strategy](./07-testing.md) - Load testing for strategy comparison
- [Deployment Guide](./06-deployment.md) - Production configuration recommendations
