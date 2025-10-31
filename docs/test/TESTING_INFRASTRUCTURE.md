# DAAP Testing Infrastructure Analysis Report

## Executive Summary

The DAAP project has a **comprehensive testing infrastructure** with multiple layers:
1. **Load Testing Tools** - Query generation, bulk execution, cache testing
2. **OpenTelemetry/Jaeger Integration** - Distributed tracing with span collection
3. **Strategy Comparison Framework** - Metrics aggregation and report generation
4. **Unit/Integration Tests** - Jest-based testing
5. **Docker Infrastructure** - MongoDB, Redis, Dragonfly, Prometheus, Jaeger

The system supports **mass testing with metrics collection** but has several gaps in automation and real-time analytics.

---

## 1. Load Testing Infrastructure

### 1.1 Query Generation (`packages/tools/load-testing/scripts/query-generator.ts`)

**Purpose**: Generate realistic search queries for load testing

**Features**:
- Generates 7 types of queries:
  1. Single-word queries (25% of volume)
  2. Composite queries - 2-3 words (35%)
  3. Phrase queries (15%)
  4. Technical queries (10%)
  5. Rare/unusual queries (5%)
  6. Numeric queries (10%)
  7. Query variations with suffixes (optional)

**Capabilities**:
- Configurable distribution based on volume
- Duplicate ratio control (20% default) for cache hit simulation
- Automatic query shuffling
- Saves to JSON with statistics

**Output Files**:
```
packages/tools/load-testing/data/
├── queries-100.json
├── queries-1000.json
├── queries-10000.json
├── queries-100000.json
└── keywords.json (source keywords)
```

**Usage**:
```bash
pnpm query:generate 10000          # Generate 10k queries
pnpm query:generate 50000 --duplicates 0.3  # 50k with 30% duplicates
```

### 1.2 Bulk Test Runner (`packages/tools/load-testing/scripts/bulk-test-runner.ts`)

**Purpose**: Execute concurrent queries against the cache service and measure performance

**Features**:
- Concurrency control (configurable parallel requests)
- Real-time progress bar with visual feedback
- Automatic retry logic (up to 2 retries)
- Cache hit detection via response source field
- Response time measurement per query
- HTTP request pooling

**Metrics Collected**:
```typescript
{
  success: boolean;
  query: string;
  responseTime: number;      // milliseconds
  status: number;            // HTTP status code
  cached: boolean;           // cache hit indicator
}
```

**Output**:
```
packages/tools/load-testing/results/
cache-test-{count}-{timestamp}.json
```

**Example Result**:
```json
{
  "timestamp": "2025-10-30T08:18:00.000Z",
  "queryCount": 1000,
  "concurrency": 10,
  "totalTime": 45321,
  "results": [
    {
      "success": true,
      "query": "laptop charger",
      "responseTime": 8,
      "status": 200,
      "cached": true
    }
  ]
}
```

**Usage**:
```bash
pnpm test:bulk 5000 10         # 5000 queries, 10 concurrent
pnpm test:bulk 100000 20 -v    # 100k queries with verbose logging
```

### 1.3 Benchmark Analyzer (`packages/tools/load-testing/scripts/benchmark-analyzer.ts`)

**Purpose**: Measure performance metrics of Redis and Dragonfly

**Metrics Measured**:
- **Latency**: Single-key GET operation (ms)
- **QPS**: Queries Per Second (throughput)
- **Peak QPS**: Maximum theoretical capacity
- **Snapshot Speed**: BGSAVE performance (MB/s)

**Measurement Methods**:
1. **Primary**: Uses `memtier_benchmark` if available
2. **Fallback**: Parallel redis-cli queries with estimation

**Output**:
```
packages/tools/load-testing/results/
benchmark-analysis-{timestamp}.json
```

**Example Output**:
```json
{
  "timestamp": "2025-10-25T16:32:35.702Z",
  "type": "benchmark-analysis",
  "results": [
    {
      "service": "Redis",
      "responseTime": 2,
      "qps": 300000,
      "snapshotSpeed": 150,
      "peakQPS": 200000
    },
    {
      "service": "Dragonfly",
      "responseTime": 1,
      "qps": 3800000,
      "snapshotSpeed": 750,
      "peakQPS": 3800000
    }
  ]
}
```

**Usage**:
```bash
pnpm benchmark:analyze              # Quick benchmark
pnpm benchmark:analyze -s redis     # Benchmark Redis only
pnpm benchmark:analyze -d           # Detailed metrics
```

### 1.4 Keyword Analysis (`packages/tools/load-testing/scripts/keyword-analyzer.ts`)

**Purpose**: Extract insights from test results about keyword popularity and cache hit patterns

**Metrics**:
- Keyword frequency
- Percentage of total queries
- Cache hit rate per keyword
- Average response times
- Top keywords by frequency

**Output Formats**:
- JSON: Raw data
- CSV: Spreadsheet format

**Example CSV**:
```
keyword,frequency,percentage,avg_response_time,queries,cache_hit_rate
laptop,2356,0.90,4479.48,918,93.03
screen,3151,1.20,4749.81,1359,76.38
product,3235,1.23,4223.75,1086,98.97
```

**Usage**:
```bash
pnpm keyword:analyze cache-test-100000-1761409634740.json
```

### 1.5 Cache Utilities (`packages/tools/load-testing/utils/cache.ts`)

**Purpose**: Controller for Redis/Dragonfly operations

**Capabilities**:
- Migration (Dragonfly → Redis)
- Connection checking
- Performance measurement (throughput, snapshot speed)
- Benchmark metrics aggregation

**Key Methods**:
- `checkCacheAvailability()` - Verify Redis/Dragonfly connectivity
- `migrateDragonflyToRedis()` - Bulk data migration
- `measureThroughput()` - Calculate QPS
- `measureSnapshotSpeed()` - BGSAVE performance
- `getBenchmarkMetrics()` - Combined metrics

---

## 2. OpenTelemetry/Jaeger Integration

### 2.1 Telemetry Package (`packages/telemetry/`)

**Purpose**: Centralized OpenTelemetry instrumentation

**Structure**:
```
packages/telemetry/src/
├── sdk.ts                    # NodeSDK bootstrap
├── tracer.ts                 # TracingService singleton
├── context-propagation.ts    # HTTP header injection
├── constants.ts              # Semantic conventions
├── cache-metrics.ts          # Cache-specific metrics
└── index.ts                  # Public API
```

**Auto-Instrumentations**:
- HTTP (Express, Axios)
- MongoDB (queries, aggregations)
- NestJS core
- DNS, fs (disabled to reduce noise)

**Configuration**:
```typescript
initializeTelemetry({
  serviceName: 'cache-service',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  logLevel: 'info'
})
```

**Environment Variables**:
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
OTEL_TRACES_SAMPLER=always_on           # or traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0             # sampling ratio
```

### 2.2 Jaeger UI

**Access**: `http://localhost:16686`

**Ports**:
- 16686: Web UI
- 4317: OTLP gRPC receiver
- 4318: OTLP HTTP receiver

**Key Trace Points**:
```
Span: GET /search (reviews-service)
  └─ Span: http.client → cache-service
      └─ Span: cache.get
          ├─ Span: cache.lookup.normalized
          ├─ Span: cache.lookup.fuzzy
          └─ Span: http.client.search_service
              └─ Span: search.mongodb_query
                  ├─ Span: mongodb.find
                  └─ Span: mongodb.countDocuments
```

**Custom Span Attributes** (Cache Service):
- `cache.hit_type`: normalized | fuzzy | miss
- `cache.query`: Query string
- `cache.fuzzy.similarity`: 0.0-1.0 score
- `eviction.strategy`: lfu | lru | hybrid
- `eviction.entries.evicted`: Count

---

## 3. Strategy Comparison Framework

### 3.1 Jaeger Collector (`packages/tools/strategy-comparison/jaeger-collector.ts`)

**Purpose**: Fetch eviction traces from Jaeger API

**Fetches**:
- Traces for specific eviction strategy
- Filters by time range (lookbackHours)
- Extracts span tags as metrics

**EvictionMetrics Structure**:
```typescript
{
  traceId: string;
  timestamp: number;
  strategy: 'lfu' | 'lru' | 'hybrid';
  triggered: boolean;
  entriesBefore: number;
  entriesAfter: number;
  entriesEvicted: number;
  durationMs: number;
  scoreAvg: number;
  scoreMin: number;
  scoreMax: number;
  utilizationBefore: number;
  utilizationAfter: number;
}
```

**Usage**:
```bash
ts-node jaeger-collector.ts lfu 1 1000    # LFU, 1 hour lookback, 1000 traces
ts-node jaeger-collector.ts hybrid 2 5000 # Hybrid, 2 hour lookback
```

**Output**:
```
packages/tools/results/traces/
{strategy}-eviction-metrics-{timestamp}.json
```

### 3.2 Metrics Aggregator (`packages/tools/strategy-comparison/metrics-aggregator.ts`)

**Purpose**: Compute statistics from raw eviction metrics

**AggregatedMetrics Output**:
```typescript
{
  strategy: string;
  totalEvictions: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;       // 50th percentile
  p95DurationMs: number;       // 95th percentile
  p99DurationMs: number;       // 99th percentile
  avgEntriesEvicted: number;
  totalEntriesEvicted: number;
  avgScoreBefore: number;
  avgUtilizationBefore: number;
  avgUtilizationAfter: number;
  evictionEfficiency: number;  // entries/ms
}
```

**Percentile Calculation**: Using ordered array indexing

**Usage**:
```bash
ts-node metrics-aggregator.ts path/to/metrics.json
```

### 3.3 Report Generator (`packages/tools/strategy-comparison/report-generator.ts`)

**Purpose**: Generate comparison reports in Markdown and CSV

**Generates**:
1. **Markdown Table**:
   - Metrics comparison across strategies
   - Rankings (fastest, most efficient, best utilization)

2. **CSV Export**:
   - Machine-readable metrics
   - Suitable for external analysis

**Rankings**:
- Fastest Eviction: Lowest avgDurationMs
- Most Efficient: Highest evictionEfficiency
- Best Utilization: Lowest avgUtilizationAfter

**Output Files**:
```
packages/tools/results/
├── comparison-report-{timestamp}.md
└── comparison-report-{timestamp}.csv
```

### 3.4 Compare Strategies (Orchestrator)

**Purpose**: Main script orchestrating the full comparison workflow

**Workflow**:
1. Collect traces for LFU
2. Aggregate metrics
3. Collect traces for LRU
4. Aggregate metrics
5. Collect traces for Hybrid
6. Aggregate metrics
7. Generate comparison reports

**Execution**:
```bash
ts-node compare-strategies.ts           # Default 1 hour lookback
ts-node compare-strategies.ts 2         # 2 hour lookback
ts-node compare-strategies.ts 4         # 4 hour lookback (comprehensive)
```

---

## 4. Unit & Integration Tests

### 4.1 LFU Implementation Tests (`apps/cache-service/test/lfu.spec.ts`)

**Coverage**:
- Keyword extraction
- Similarity calculation
- Frequency increment on access
- Entry eviction ordering
- LFU manager operations

**Test Setup**:
- Uses Redis DB 1 for isolation
- Cleans up before/after each test
- Mock ConfigService for parameters

**Key Test Cases**:
- Keyword extraction with stop words
- Similarity calculation (Jaccard)
- Frequency tracking
- Eviction priority ordering

### 4.2 Eviction Strategies Tests (`apps/cache-service/test/eviction-strategies.spec.ts`)

**Coverage**:
- LFU strategy behavior
- LRU strategy behavior
- Hybrid strategy behavior
- Entry registration
- Access recording
- Score calculation

**Database Isolation**:
- LFU tests use Redis DB 1
- Strategy tests use Redis DB 2
- Full cleanup after each test

---

## 5. Docker Infrastructure

### 5.1 Services

**Tracing**:
```yaml
jaeger:
  ports:
    - 16686  # Web UI
    - 4317   # OTLP gRPC
    - 4318   # OTLP HTTP
```

**Metrics**:
```yaml
prometheus:
  ports:
    - 9090
  scrape_configs:
    - job_name: 'reviews-service'
    - job_name: 'cache-service'
    - job_name: 'search-service'
```

**Cache Systems**:
```yaml
redis:
  port: 6379

dragonfly:
  port: 6380
```

**Database**:
```yaml
mongodb:
  port: 27017
```

---

## 6. Current Test Results

### 6.1 Existing Test Data

**Location**: `packages/tools/load-testing/results/`

**Files Exist**:
```
cache-test-100-*.json              (100 queries)
cache-test-1000-*.json             (1,000 queries)
cache-test-10000-*.json            (10,000 queries)
cache-test-100000-*.json           (100,000 queries)
benchmark-analysis-*.json          (Performance benchmarks)
keyword-analysis-*.json            (Keyword statistics)
keyword-analysis-*.csv             (Keyword data)
```

**Performance Summary** (from RESULTS.md):
| Queries | Cache Time (ms) | No Cache (ms) | Improvement |
|---------|-----------------|---------------|-------------|
| 1,000   | 8               | 7,580         | 99.89%      |
| 10,000  | 8               | 9,656         | 99.92%      |
| 100,000 | 8               | 6,988         | 99.87%      |

---

## 7. Identified Gaps for Mass Testing with Metrics

### Gap 1: No Orchestrated End-to-End Test Runner
**Issue**: Cannot run all tests sequentially with centralized reporting
**Impact**: Manual coordination of load tests, benchmark analysis, and strategy comparison
**Solution**: Create unified test orchestrator

### Gap 2: Real-Time Metrics Dashboard
**Issue**: No live monitoring during tests
**Impact**: Cannot see performance issues until test completion
**Solution**: Implement live dashboard or metrics streaming

### Gap 3: Strategy Switching During Tests
**Issue**: Must stop/restart services to change eviction strategy
**Impact**: Long test cycles when comparing strategies
**Solution**: Add runtime strategy switching via API

### Gap 4: Automated Stress Testing
**Issue**: Load test only executes queries, no stress/saturation scenarios
**Impact**: Cannot test cache behavior under extreme load
**Solution**: Add configurable stress patterns

### Gap 5: Results Aggregation
**Issue**: Results scattered across multiple JSON files
**Impact**: Manual compilation of comprehensive reports
**Solution**: Unified results repository with aggregate statistics

### Gap 6: Distributed Load Generation
**Issue**: Single-machine load testing limits throughput
**Impact**: Cannot accurately measure peak performance
**Solution**: Multi-instance load generation (future)

### Gap 7: Missing Integration with Load Balancer Metrics
**Issue**: Traefik metrics not collected
**Impact**: No visibility into routing/balancing performance
**Solution**: Add Traefik metrics collection

### Gap 8: No Health Check Monitoring During Tests
**Issue**: Services may fail silently during long tests
**Impact**: Misleading results from degraded services
**Solution**: Add continuous health checks during testing

---

## 8. Recommended Enhancements for Mass Testing

### Priority 1 - Critical
1. **Test Orchestrator**: Unified script managing all test phases
2. **Metrics Persistence**: Central database for all results
3. **Automated Reporting**: Single command generates complete reports

### Priority 2 - High
4. **Real-Time Monitoring**: Live dashboard during tests
5. **Health Checks**: Continuous service monitoring
6. **Stress Testing**: Load curves, saturation scenarios

### Priority 3 - Medium
7. **Result Aggregation**: Multi-run comparisons
8. **Distributed Load**: Multi-instance testing
9. **CI/CD Integration**: Automated performance regression testing

---

## 9. Existing Scripts Summary

### npm Scripts (packages/tools/package.json)
```bash
pnpm test:bulk                  # Bulk test runner
pnpm query:generate             # Query generator
pnpm benchmark:analyze          # Benchmark analysis
pnpm keyword:analyze            # Keyword analysis
pnpm cache:comparison           # Cache result comparison
pnpm cache:comparison:single    # Single cache comparison
```

### Manual TypeScript Scripts
```bash
ts-node jaeger-collector.ts
ts-node metrics-aggregator.ts
ts-node compare-strategies.ts
```

---

## 10. Data Flow Diagram

```
Start Test
  ↓
Query Generator
  ↓ (generates queries-N.json)
Bulk Test Runner
  ↓ (concurrent HTTP requests)
Cache Service
  ↓ (emits spans to Jaeger)
Jaeger
  ↓ (stores traces)
Benchmark Analyzer
  ↓ (measures throughput)
Cache Result Comparison
  ↓ (analyzes cache hits)
Keyword Analyzer
  ↓ (extracts insights)
Results Directory
  ├─ cache-test-*.json
  ├─ benchmark-analysis-*.json
  ├─ keyword-analysis-*.json
  └─ simulation-results-*.json
```

---

## 11. Testing Environment Setup Checklist

Before running comprehensive tests:

- [ ] Docker services running: `docker-compose up -d`
- [ ] Jaeger accessible: `http://localhost:16686`
- [ ] Prometheus accessible: `http://localhost:9090`
- [ ] Redis available: `redis-cli -p 6379 ping`
- [ ] Dragonfly available: `redis-cli -p 6380 ping`
- [ ] MongoDB populated with test data
- [ ] Services healthy: `docker-compose ps` shows "healthy"
- [ ] npm dependencies installed: `pnpm install`
- [ ] Results directory writable: `packages/tools/load-testing/results/`

---

## 12. Performance Baselines

### Established Metrics (from RESULTS.md)

**Cache Performance**:
- Cache hit latency: ~8ms
- Cache miss latency: ~7000ms (1000x slower)
- Cache hit rate: 76-99% depending on keywords

**Eviction Behavior**:
- Typical batch size: 50 entries
- Trigger threshold: 1000 max entries
- Distribution: Zset operations < 1ms

**System Resources**:
- CPU with cache: 6-12%
- CPU without cache: 95%
- Memory impact: ~1GB per 100k entries

---

## Conclusion

DAAP has a **solid foundation** for load testing with:
- Flexible query generation
- Real-time metrics collection via OpenTelemetry
- Strategy comparison framework
- Comprehensive unit tests
- Production-grade infrastructure

The main limitation is **lack of orchestration** - tests are run manually and results are scattered. Implementing an automated test orchestrator would enable:
- Reproducible testing workflows
- Consistent reporting
- Continuous performance monitoring
- Regression detection

This document should serve as a reference for understanding the current capabilities and planning enhancement efforts.
