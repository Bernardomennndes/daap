# k6 Load Testing - DAAP Cache System

Professional load testing suite for the DAAP distributed cache system using [k6](https://k6.io/) with InfluxDB and Grafana integration.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Scenarios](#test-scenarios)
- [Viewing Results](#viewing-results)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

---

## 🎯 Overview

This k6 testing suite provides comprehensive load testing capabilities for evaluating:

- **Cache Performance**: Hit rate, latency, throughput
- **Eviction Strategies**: LFU, LRU, Hybrid comparison
- **System Resilience**: Stress testing, spike testing
- **End-to-end Tracing**: Integration with Jaeger distributed tracing

### Key Features

✅ **Realistic Load Patterns**: Warmup, ramp-up, peak, stress phases
✅ **Custom Metrics**: Cache hit rate, eviction tracking, source distribution
✅ **Strategy Comparison**: Automated testing of all 3 eviction strategies
✅ **Real-time Dashboards**: Pre-built Grafana dashboards
✅ **Distributed Tracing**: Correlated with Jaeger traces
✅ **CI/CD Ready**: JSON/HTML reports for automation

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose installed
- DAAP infrastructure running (`docker-compose up -d`)
- At least 4GB RAM available for load testing

### 1. Install k6 Docker Image

```bash
pnpm k6:install
```

### 2. Run Your First Test

```bash
# Default test (cache-load-test with LFU strategy)
pnpm k6:test
```

This will:
- Run a 15-minute load test with realistic traffic patterns
- Send metrics to InfluxDB
- Generate HTML and JSON reports in `packages/tools/k6/results/`
- Display real-time metrics in Grafana

### 3. View Results

**Grafana Dashboard:**
```
http://localhost:3000
→ Login: admin / admin
→ Dashboards → Load Testing → k6 Cache Performance
```

**Summary Reports:**
```
packages/tools/k6/results/summary-lfu-*.html
packages/tools/k6/results/summary-lfu-*.json
```

---

## 🧪 Test Scenarios

### 1. Cache Load Test (`cache-load-test.js`)

**Purpose**: Validate cache performance under realistic load

**Duration**: ~15 minutes

**Load Pattern**:
```
Warmup:    10 VUs × 2min  (populate cache)
Ramp-up:   10 → 50 VUs × 3min
Peak:      100 VUs × 5min
Stress:    150 VUs × 2min
Recovery:  50 VUs × 2min
Ramp-down: 0 VUs × 1min
```

**Query Distribution**:
- 70% popular queries (high cache hit expected)
- 20% long-tail queries (medium cache hit)
- 10% unique queries (cache miss)

**Run:**
```bash
pnpm k6:test
# or
bash scripts/run-k6-test.sh
```

**Thresholds (SLAs)**:
```javascript
'http_req_failed': ['rate<0.01'],           // < 1% errors
'http_req_duration': ['p(95)<100'],         // 95% < 100ms
'cache_hit_rate': ['rate>0.80'],            // 80% hit rate
'cache_response_time': ['p(95)<50'],        // Cache: 95% < 50ms
'search_response_time': ['p(95)<8000'],     // Search: 95% < 8s
'http_reqs': ['rate>50'],                   // > 50 RPS
```

---

### 2. Stress Test (`cache-stress-test.js`)

**Purpose**: Trigger cache eviction and validate system behavior under pressure

**Duration**: ~12 minutes

**Load Pattern**:
```
Ramp-up: 50 VUs × 1min
Stress:  200 VUs × 10min (aggressive unique queries)
Ramp-down: 0 VUs × 1min
```

**Behavior**:
- Generates **unique queries** every request
- Forces cache to fill beyond max capacity
- Validates eviction is triggered
- Ensures performance remains acceptable

**Run:**
```bash
pnpm k6:test:stress
# or
bash scripts/run-k6-test.sh --script cache-stress-test.js
```

**Thresholds**:
```javascript
'eviction_triggered_total': ['count>0'],  // Eviction MUST happen
'http_req_duration': ['p(95)<200'],       // Still performant
'http_req_failed': ['rate<0.01'],         // < 1% errors
```

---

### 3. Strategy Comparison (`strategy-comparison-test.js`)

**Purpose**: Compare LFU, LRU, and Hybrid eviction strategies

**Duration**: ~7 minutes per strategy

**Load Pattern**:
```
Warmup: 30 VUs × 1min
Steady: 50 VUs × 5min
Ramp-down: 0 VUs × 1min
```

**Run Single Strategy:**
```bash
pnpm k6:test:lfu
pnpm k6:test:lru
pnpm k6:test:hybrid
```

**Run All Strategies (Automated):**
```bash
pnpm k6:compare
```

This will:
1. Run test for LFU strategy
2. Restart cache-service with LRU
3. Run test for LRU strategy
4. Restart cache-service with Hybrid
5. Run test for Hybrid strategy
6. Generate comparison report

**Total Duration**: ~21 minutes

---

## 🎭 Query Contexts

The k6 tests support **contextual query datasets** to adapt testing to different review domains. This allows testing with realistic queries for different product categories.

### Available Contexts

#### 1. **Electronics** (Default)
Queries for electronic product reviews (laptops, phones, chargers, etc.)

```bash
# Explicitly use electronics context
./scripts/run-k6-test.sh --context electronics

# Or via npm
QUERY_CONTEXT=electronics pnpm k6:test
```

**Example queries**:
- Popular: `laptop`, `phone`, `charger`, `wireless`, `usb`
- Long-tail: `laptop screen protector 15 inch`, `usb-c charger fast charging`

#### 2. **Game Soundtracks**
Queries for video game music and soundtrack reviews

```bash
# Use game soundtracks context
./scripts/run-k6-test.sh --context game_soundtracks

# Or via npm
QUERY_CONTEXT=game_soundtracks pnpm k6:test
```

**Example queries**:
- Popular: `zelda`, `mario`, `final fantasy`, `skyrim`, `minecraft`
- Long-tail: `zelda breath of wild soundtrack`, `final fantasy battle theme`

### Query Distribution

All tests use the following distribution (same across all contexts):

- **70%** - Popular queries (high cache hit expected)
- **20%** - Long-tail queries (medium cache hit)
- **10%** - Unique generated queries (cache miss expected)

### Adding New Contexts

To add a new query context:

1. **Edit** [`packages/tools/k6/data/query-contexts.json`](./data/query-contexts.json)

2. **Add your context**:
   ```json
   {
     "my_context": {
       "name": "My Context Name",
       "description": "Description of this context",
       "popular": ["query1", "query2", "query3", ...],
       "longTail": ["long query one", "long query two", ...],
       "uniqueWords": ["word1", "word2", "word3", ...]
     }
   }
   ```

3. **Run tests**:
   ```bash
   ./scripts/run-k6-test.sh --context my_context
   ```

### Context-Aware Testing Examples

**Test electronics with LFU**:
```bash
./scripts/run-k6-test.sh --context electronics --strategy lfu
```

**Test game soundtracks with Hybrid**:
```bash
./scripts/run-k6-test.sh --context game_soundtracks --strategy hybrid
```

**Stress test with soundtracks**:
```bash
./scripts/run-k6-test.sh --script cache-stress-test.js --context game_soundtracks
```

**Compare strategies with game soundtracks**:
```bash
# Set context before running comparison
QUERY_CONTEXT=game_soundtracks pnpm k6:compare
```

### Benefits

✅ **Domain-specific testing**: Test with realistic queries for your data
✅ **Easy configuration**: Just pass `--context` flag
✅ **Consistent structure**: Same test logic, different vocabulary
✅ **Extensible**: Add new contexts without changing code

---

## 📊 Viewing Results

### Grafana Dashboard

1. **Access**: http://localhost:3000 (admin/admin)
2. **Navigate**: Dashboards → Load Testing → k6 Cache Performance
3. **Panels**:
   - Cache Hit Rate (Gauge)
   - Response Time Percentiles (P50, P95, P99)
   - Request Rate (RPS)
   - Response Source Distribution (Pie Chart)
   - Cache vs Search Latency
   - Cache Utilization
   - Virtual Users (Load)
   - Error Rate

**Filter by Strategy**:
- Use the `eviction_strategy` variable dropdown
- Select: `lfu`, `lru`, or `hybrid`

### InfluxDB (Raw Data)

**Access**: http://localhost:8086
**Login**: admin / adminadmin
**Organization**: daap
**Bucket**: k6

**Example Query** (Flux):
```flux
from(bucket: "k6")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cache_hit_rate")
  |> filter(fn: (r) => r._field == "rate")
  |> mean()
```

### Jaeger (Distributed Traces)

**Access**: http://localhost:16686

**Correlate with Load Test**:
1. Service: `reviews-service`
2. Operation: `GET /search`
3. Time range: Match k6 test duration
4. Tags: `cache.hit_type`, `cache.query`

### Summary Reports

**HTML Report** (Human-readable):
```
packages/tools/k6/results/summary-{strategy}-{timestamp}.html
```

**JSON Report** (Machine-parsable):
```
packages/tools/k6/results/summary-{strategy}-{timestamp}.json
```

**Example JSON Structure**:
```json
{
  "metrics": {
    "http_req_duration": {
      "avg": 12.5,
      "p50": 8.2,
      "p95": 45.3,
      "p99": 120.7
    },
    "cache_hit_rate": {
      "rate": 0.87
    }
  },
  "root_group": {
    "checks": {
      "status is 200": {
        "passes": 15234,
        "fails": 12
      }
    }
  }
}
```

---

## 🔧 Configuration

### Environment Variables

**Set via command line**:
```bash
BASE_URL=http://reviews.localhost \
EVICTION_STRATEGY=hybrid \
bash scripts/run-k6-test.sh
```

**Available Variables**:
```bash
BASE_URL                  # Reviews Service URL (default: http://reviews-service:3001)
CACHE_URL                 # Cache Service URL (default: http://cache-service:3002)
EVICTION_STRATEGY         # lfu | lru | hybrid (default: lfu)
NODE_ENV                  # testing | production (default: testing)

# InfluxDB (automatic)
K6_OUT                    # Output destination
K6_INFLUXDB_ORGANIZATION  # InfluxDB org (daap)
K6_INFLUXDB_BUCKET        # Bucket name (k6)
K6_INFLUXDB_TOKEN         # Auth token
```

### Custom Test Parameters

**Edit test scripts** in `packages/tools/k6/scripts/`:

```javascript
// cache-load-test.js

export const options = {
  stages: [
    { duration: '5m', target: 200 },  // Customize load
  ],
  thresholds: {
    'http_req_duration': ['p(95)<80'], // Adjust SLAs
    'cache_hit_rate': ['rate>0.90'],
  },
};
```

### Query Data

**Customize queries** in `packages/tools/k6/data/queries.json`:

```json
{
  "popular": [
    "your-custom-query",
    "another-query"
  ],
  "longTail": [
    "multi word query",
    "specific search term"
  ]
}
```

---

## 🏗️ Architecture

### Data Flow

```
k6 Load Generator
    ↓ HTTP Requests
Reviews Service → Cache Service → Search Service
    ↓                    ↓
Jaeger (Traces)    Redis/Dragonfly
    ↓
MongoDB

k6 Metrics
    ↓ InfluxDB Line Protocol
InfluxDB (Time Series)
    ↓ Flux Queries
Grafana Dashboard
```

### Metrics Collected

**k6 Built-in Metrics**:
- `http_req_duration` - Request latency
- `http_req_failed` - Error rate
- `http_reqs` - Request rate (RPS)
- `vus` - Virtual users (load)
- `checks` - Validation pass rate

**Custom Metrics** (DAAP-specific):
- `cache_hits_total` - Total cache hits
- `cache_misses_total` - Total cache misses
- `cache_hit_rate` - Hit rate percentage
- `cache_response_time` - Cache hit latency
- `search_response_time` - Cache miss latency
- `source_cache`, `source_search`, `source_search_direct` - Response sources
- `popular_query_requests`, `long_tail_query_requests`, `unique_query_requests` - Query types
- `eviction_count` - Number of evictions
- `cache_utilization_percent` - Cache capacity usage

---

## 🐛 Troubleshooting

### Test fails with connection errors

**Symptom**:
```
ERRO[0001] GoError: Get "http://reviews-service:3001/search": dial tcp: lookup reviews-service
```

**Solution**:
```bash
# 1. Ensure services are running
docker-compose ps

# 2. Verify health
curl http://reviews.localhost/health
curl http://cache.localhost/health

# 3. Check network
docker network inspect daap_app_network

# 4. Restart infrastructure
docker-compose restart
```

---

### InfluxDB not receiving metrics

**Symptom**: Grafana dashboard shows "No data"

**Solution**:
```bash
# 1. Check InfluxDB is running
docker ps | grep influxdb

# 2. View InfluxDB logs
docker-compose logs influxdb

# 3. Verify bucket exists
docker exec -it daap-influxdb influx bucket list

# 4. Test query
docker exec -it daap-influxdb influx query \
  'from(bucket: "k6") |> range(start: -1h) |> limit(n: 10)'

# 5. Restart InfluxDB
docker-compose restart influxdb
```

---

### Grafana dashboard shows no data

**Steps**:

1. **Check Data Source**:
   - Grafana → Configuration → Data Sources
   - Select "InfluxDB (k6)"
   - Click "Save & Test" → Should show "Data source is working"

2. **Verify Token**:
   - Token should be: `daap-k6-secret-token`
   - Organization: `daap`
   - Bucket: `k6`

3. **Check Time Range**:
   - Grafana dashboard time picker
   - Ensure it covers test execution time
   - Try "Last 1 hour" or "Last 6 hours"

4. **Verify Metrics**:
```bash
docker exec -it daap-influxdb influx query \
  'from(bucket: "k6") |> range(start: -1h) |> filter(fn: (r) => r._measurement == "cache_hit_rate")'
```

---

### Thresholds failing

**Symptom**: Test exits with `✗ threshold violated`

**Causes**:
- System overloaded (check CPU/memory)
- Cache not warmed up properly
- Network latency issues
- Database slow queries

**Solutions**:
```bash
# 1. Check system resources
docker stats

# 2. Reduce load
# Edit cache-load-test.js:
stages: [
  { duration: '5m', target: 50 },  # Lower VUs
]

# 3. Adjust thresholds
thresholds: {
  'http_req_duration': ['p(95)<200'],  # More lenient
}

# 4. Warm up cache first
curl "http://reviews.localhost/search?q=laptop&page=1&size=10"
curl "http://reviews.localhost/search?q=phone&page=1&size=10"
# ... repeat for popular queries
```

---

### Strategy comparison fails

**Symptom**: Cache service restart fails or test hangs

**Solution**:
```bash
# 1. Check cache service logs
docker-compose logs cache-service

# 2. Verify environment variable update
docker exec daap-cache-service env | grep EVICTION_STRATEGY

# 3. Manual strategy change
echo "EVICTION_STRATEGY=lru" >> .env
docker-compose restart cache-service

# 4. Wait for healthy state
docker exec daap-cache-service wget -O- http://localhost:3002/health
```

---

## 🚀 Advanced Usage

### Distributed Testing (Multiple Machines)

**Not implemented yet**, but k6 supports distributed execution:

```bash
# Master node
k6 run --execution-segment "0:1/4" cache-load-test.js

# Worker nodes (split load)
k6 run --execution-segment "1/4:2/4" cache-load-test.js
k6 run --execution-segment "2/4:3/4" cache-load-test.js
k6 run --execution-segment "3/4:1" cache-load-test.js
```

### CI/CD Integration

**GitHub Actions Example**:

```yaml
name: Load Test

on:
  push:
    branches: [main]

jobs:
  k6-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start infrastructure
        run: docker-compose up -d

      - name: Wait for services
        run: sleep 30

      - name: Run k6 test
        run: pnpm k6:test

      - name: Check thresholds
        run: |
          if grep -q '"fails": 0' packages/tools/k6/results/summary-*.json; then
            echo "✅ All thresholds passed"
          else
            echo "❌ Thresholds failed"
            exit 1
          fi

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: packages/tools/k6/results/
```

### Custom Scenarios

**Create new test** in `packages/tools/k6/scripts/`:

```javascript
// my-custom-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '5m',
};

export default function () {
  const res = http.get('http://reviews-service:3001/search?q=test');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
```

**Run**:
```bash
bash scripts/run-k6-test.sh --script my-custom-test.js
```

---

## 📚 Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [InfluxDB Flux Language](https://docs.influxdata.com/flux/v0.x/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [DAAP Architecture](../../../CLAUDE.md)
- [DAAP Testing Infrastructure](../../../TESTING_INFRASTRUCTURE.md)

---

## 📝 Notes

- **Performance Impact**: k6 uses minimal resources (~50MB RAM for 100 VUs)
- **Network**: Uses Docker network `daap_app_network` for service communication
- **Data Retention**: InfluxDB retains data indefinitely (configure retention policy if needed)
- **Concurrency**: Test locally before scaling to prevent overwhelming the system
- **Monitoring**: Watch `docker stats` during tests to identify bottlenecks

---

## 🙋 Support

**Issues?** Check:
1. [Troubleshooting](#troubleshooting) section above
2. DAAP logs: `docker-compose logs -f`
3. k6 documentation: https://k6.io/docs/

**Report bugs**: Create an issue in the repository with:
- k6 version (`docker run grafana/k6:0.49.0 version`)
- Test script used
- Error logs
- System specs (CPU, RAM, Docker version)

---

**Happy Load Testing! 🚀**
