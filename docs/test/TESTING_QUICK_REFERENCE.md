# DAAP Testing Infrastructure - Quick Reference Guide

## Testing Tools Available

### Load Testing
```
Query Generation
├─ Single/Composite/Phrase queries
├─ 100 to 100,000 queries
└─ Configurable duplication ratio

Bulk Execution
├─ Concurrent load (1-20+ parallel)
├─ Real-time progress tracking
├─ Cache hit detection
└─ Response time measurement

Benchmark Analysis
├─ Redis/Dragonfly comparison
├─ Throughput (QPS) measurement
├─ Latency measurement
└─ Snapshot speed
```

### Metrics Collection
```
OpenTelemetry Integration
├─ Distributed tracing via Jaeger
├─ Automatic HTTP/MongoDB instrumentation
├─ Custom business metrics
└─ Context propagation

Strategy Comparison
├─ Eviction metrics collection
├─ Multi-strategy aggregation
├─ Ranking and scoring
└─ Report generation (Markdown/CSV)
```

### Unit Testing
```
Jest-based Tests
├─ LFU implementation (lfu.spec.ts)
├─ Eviction strategies (eviction-strategies.spec.ts)
├─ Cache optimization (cache-optimization.spec.ts)
└─ Search functionality (search.spec.ts)
```

---

## Quick Start Commands

### 1. Generate Test Queries
```bash
cd packages/tools
pnpm query:generate 1000                 # Generate 1000 queries
pnpm query:generate 50000 --duplicates 0.3  # 50k with 30% duplicate for hits
```

### 2. Run Load Test
```bash
cd packages/tools
pnpm test:bulk 5000 10        # 5000 queries, 10 concurrent
pnpm test:bulk 100000 20      # 100k queries, 20 concurrent (stress test)
```

### 3. Analyze Benchmark
```bash
cd packages/tools
pnpm benchmark:analyze              # Full benchmark
pnpm benchmark:analyze -s redis     # Redis only
```

### 4. Extract Keywords
```bash
cd packages/tools
pnpm keyword:analyze cache-test-100000-*.json
```

### 5. Compare Strategies
```bash
cd packages/tools/strategy-comparison
ts-node compare-strategies.ts 1       # 1 hour lookback
ts-node compare-strategies.ts 2       # 2 hour lookback (better data)
```

---

## Test Result Locations

```
packages/tools/load-testing/results/
├─ cache-test-{count}-{timestamp}.json      # Load test results
├─ benchmark-analysis-{timestamp}.json      # Benchmark metrics
├─ keyword-analysis-{timestamp}.json        # Keyword distribution
├─ keyword-analysis-{timestamp}.csv         # CSV export
└─ {strategy}-simulation-results.json       # Artillery simulation

packages/tools/results/
├─ comparison-report-{timestamp}.md         # Strategy comparison
├─ comparison-report-{timestamp}.csv        # CSV export
└─ traces/
    └─ {strategy}-eviction-metrics-*.json   # Raw eviction data
```

---

## Key Metrics Collected

### Per-Query Metrics
```json
{
  "success": true,
  "query": "laptop charger",
  "responseTime": 8,           // milliseconds
  "status": 200,               // HTTP status
  "cached": true               // cache hit indicator
}
```

### Aggregated Metrics
```
Total queries:        100,000
Success rate:         99.5%
Avg response time:    45ms
Cache hit rate:       87%
QPS (throughput):     2,200 q/s
P95 latency:          120ms
P99 latency:          250ms
```

### Eviction Metrics
```
Strategy:             LFU
Total evictions:      45
Avg duration:         2.5ms
P95 duration:         5.2ms
Entries evicted:      2,250 total
Efficiency:           900 entries/ms
Utilization before:   98%
Utilization after:    67%
```

---

## Performance Baselines

### Established Results
| Test | Cache Hit | Response Time | Improvement |
|------|-----------|---------------|-------------|
| 1K queries | 76-99% | 8ms | 99.89% vs no cache |
| 10K queries | 76-99% | 8ms | 99.92% vs no cache |
| 100K queries | 76-99% | 8ms | 99.87% vs no cache |

### Cache System Comparison
| Metric | Redis | Dragonfly |
|--------|-------|-----------|
| Latency | 2ms | 1ms |
| QPS | 300K | 3.8M |
| Snapshot Speed | 150 MB/s | 750 MB/s |

---

## Monitoring During Tests

### Jaeger UI
```
http://localhost:16686

Services:
  - reviews-service: GET /search endpoint traces
  - cache-service: Cache operations and evictions
  - search-service: MongoDB query performance

Filters:
  - cache.hit_type = miss (cache misses)
  - cache.hit_type = normalized (normalized hits)
  - cache.hit_type = fuzzy (fuzzy hits)
  - eviction.triggered = true (eviction events)
  - search.query = "laptop" (specific queries)
```

### Prometheus
```
http://localhost:9090

Metrics:
  - http_requests_total (by service)
  - http_request_duration_seconds
  - process_resident_memory_bytes
  - mongodb_operations_total
```

### System Monitoring
```bash
docker-compose ps                # Service health
docker stats daap-cache-service  # Live resource usage
docker logs -f daap-cache-service  # Service logs
```

---

## Test Workflow Example

### Comprehensive Test Cycle (30 minutes)

```bash
# 1. Start infrastructure
docker-compose up -d                    # ~2 min

# 2. Generate test data
pnpm query:generate 10000               # ~10 sec

# 3. Run load test
pnpm test:bulk 10000 10                 # ~5 min

# 4. Benchmark cache systems
pnpm benchmark:analyze                  # ~2 min

# 5. Analyze results
pnpm keyword:analyze cache-test-*.json  # ~30 sec

# 6. Compare strategies (requires prior tests with different strategies)
ts-node strategy-comparison/compare-strategies.ts 1  # ~2 min

# 7. View reports
cat packages/tools/results/comparison-report-*.md
```

---

## Docker Services Health Check

```bash
# Verify all services are running
docker-compose ps

# Expected output:
# daap-jaeger         Up (healthy)
# daap-prometheus     Up (healthy)
# daap-mongodb        Up (healthy)
# daap-redis          Up
# daap-dragonfly      Up
# daap-reviews-service    Up
# daap-cache-service      Up
# daap-search-service     Up
# daap-traefik        Up

# Test connectivity
redis-cli -p 6379 ping           # Should return PONG
redis-cli -p 6380 ping           # Dragonfly - should return PONG
mongosh --eval "db.version()"   # MongoDB connection
curl http://localhost:16686      # Jaeger UI
curl http://localhost:9090       # Prometheus
```

---

## Troubleshooting

### Test Results Empty?
```
1. Check if load test actually ran:
   ls -la packages/tools/load-testing/results/

2. Check if services are up:
   docker-compose ps
   
3. Test manual request:
   curl "http://reviews.localhost/search?q=laptop&page=1&size=10"
```

### Jaeger Shows No Traces?
```
1. Check Jaeger is running:
   docker ps | grep jaeger
   
2. Check service logs:
   docker logs daap-cache-service | grep OpenTelemetry
   
3. Verify OTEL endpoint:
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   
4. Test Jaeger API:
   curl http://localhost:16686/api/services
```

### Benchmark Analysis Returns 0 QPS?
```
1. Check if memtier_benchmark is available:
   which memtier_benchmark
   
2. If not installed, tool falls back to estimation
   
3. Check Redis/Dragonfly are responding:
   redis-cli -p 6379 INFO stats
   redis-cli -p 6380 INFO stats
```

---

## Files Structure Reference

```
packages/tools/
├── load-testing/
│   ├── scripts/
│   │   ├── bulk-test-runner.ts           # Main load test executor
│   │   ├── query-generator.ts            # Query generation
│   │   ├── benchmark-analyzer.ts         # Cache system benchmarking
│   │   ├── keyword-analyzer.ts           # Results analysis
│   │   └── cache-result-comparison.ts    # Comparative analysis
│   ├── data/
│   │   ├── queries-100.json
│   │   ├── queries-1000.json
│   │   ├── queries-10000.json
│   │   ├── queries-100000.json
│   │   └── keywords.json
│   ├── results/                          # All test outputs here
│   ├── utils/
│   │   ├── cache.ts                      # Cache utilities
│   │   ├── cli.ts                        # CLI wrapper
│   │   └── logger.ts                     # Logging utility
│   └── configs/
│       └── artillery-config.yml
│
├── strategy-comparison/
│   ├── jaeger-collector.ts               # Fetch traces from Jaeger
│   ├── metrics-aggregator.ts             # Compute statistics
│   ├── report-generator.ts               # Generate reports
│   ├── compare-strategies.ts             # Main orchestrator
│   └── README.md
│
└── package.json                          # npm scripts
```

---

## Environment Variables for Testing

```bash
# Cache Configuration
CACHE_ADAPTER=redis          # or dragonfly
REDIS_HOST=localhost
REDIS_PORT=6379
DRAGONFLY_HOST=localhost
DRAGONFLY_PORT=6380

# Eviction Configuration
EVICTION_STRATEGY=lfu        # or lru, hybrid
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50

# OpenTelemetry Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
OTEL_TRACES_SAMPLER=always_on
OTEL_TRACES_SAMPLER_ARG=1.0

# Database Configuration
MONGO_URI=mongodb://admin:admin@mongodb:27017/daap
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=admin
```

---

## Recommended Test Scenarios

### Scenario 1: Baseline Performance (15 min)
```bash
pnpm query:generate 1000
pnpm test:bulk 1000 5
pnpm benchmark:analyze
```
Use: Quick verification that system is working

### Scenario 2: Load Testing (30 min)
```bash
pnpm query:generate 10000
pnpm test:bulk 10000 10
pnpm keyword:analyze cache-test-*.json
```
Use: Measure cache effectiveness with realistic load

### Scenario 3: Stress Testing (45 min)
```bash
pnpm query:generate 50000 --duplicates 0.1
pnpm test:bulk 50000 20
pnpm benchmark:analyze
pnpm keyword:analyze cache-test-*.json
```
Use: Find breaking points and performance limits

### Scenario 4: Strategy Comparison (120 min)
```bash
# Run with LFU
pnpm test:bulk 10000 10
sleep 60
ts-node strategy-comparison/compare-strategies.ts 1

# Change to LRU (restart service)
docker-compose restart cache-service
pnpm test:bulk 10000 10
sleep 60

# Change to Hybrid
docker-compose restart cache-service
pnpm test:bulk 10000 10
sleep 60

# Generate comparison report
ts-node strategy-comparison/compare-strategies.ts 1
```
Use: Compare eviction strategies

---

## Key Findings from Existing Tests

1. **Cache Hit Rate**: 87-98% with realistic query distribution
2. **Performance**: 99.87-99.92% improvement with cache
3. **Latency**: Cached queries ~8ms vs 7000ms without cache
4. **Throughput**: ~2200 q/s with current configuration
5. **Dragonfly**: 12x faster than Redis in direct benchmarks

---

## Next Steps for Enhancement

1. **Automate Strategy Switching**: Add API endpoint to change eviction strategy
2. **Real-Time Dashboard**: Implement live monitoring during tests
3. **Multi-Run Analysis**: Track performance across multiple test cycles
4. **Health Checks**: Monitor service health during long tests
5. **Distributed Load**: Run tests from multiple machines
6. **CI/CD Integration**: Automated regression testing

