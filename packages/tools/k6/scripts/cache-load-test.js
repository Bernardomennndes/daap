import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Trend, Rate, Gauge } from "k6/metrics";

// ============================================================
// CUSTOM METRICS
// ============================================================

// Cache Performance
const cacheHits = new Counter("cache_hits_total");
const cacheMisses = new Counter("cache_misses_total");
const cacheHitRate = new Rate("cache_hit_rate");
const cacheLatency = new Trend("cache_response_time", true);
const searchLatency = new Trend("search_response_time", true);

// Source Distribution
const sourceCache = new Counter("source_cache");
const sourceSearch = new Counter("source_search");
const sourceSearchDirect = new Counter("source_search_direct");

// Query Types
const popularQueryRequests = new Counter("popular_query_requests");
const longTailQueryRequests = new Counter("long_tail_query_requests");
const uniqueQueryRequests = new Counter("unique_query_requests");

// Eviction Metrics
const evictionCount = new Gauge("eviction_count");
const cacheUtilization = new Gauge("cache_utilization_percent");

// ============================================================
// TEST CONFIGURATION
// ============================================================

export const options = {
  stages: [
    // Warmup Phase: Populate cache
    { duration: "2m", target: 10, name: "warmup" },

    // Ramp-up Phase
    { duration: "3m", target: 50, name: "ramp_up" },

    // Peak Load Phase
    { duration: "5m", target: 100, name: "peak_load" },

    // Stress Phase
    { duration: "2m", target: 150, name: "stress" },

    // Recovery Phase
    { duration: "2m", target: 50, name: "recovery" },

    // Ramp-down Phase
    { duration: "1m", target: 0, name: "ramp_down" },
  ],

  thresholds: {
    // HTTP Errors
    http_req_failed: ["rate<0.01"],

    // Response Times
    http_req_duration: ["p(95)<100", "p(99)<500"],

    // Cache Performance
    cache_hit_rate: ["rate>0.80"],
    cache_response_time: ["p(95)<50"],
    search_response_time: ["p(95)<8000"],

    // Throughput
    http_reqs: ["rate>50"],

    // Checks
    checks: ["rate>0.95"],
  },

  tags: {
    test_type: "cache_load_test",
    environment: __ENV.NODE_ENV || "development",
    eviction_strategy: __ENV.EVICTION_STRATEGY || "lfu",
  },

  summaryTrendStats: ["min", "avg", "med", "max", "p(90)", "p(95)", "p(99)"],
};

// ============================================================
// TEST DATA
// ============================================================

const POPULAR_QUERIES = [
  "laptop",
  "phone",
  "charger",
  "cable",
  "battery",
  "screen protector",
  "case",
  "adapter",
  "mouse",
  "keyboard",
  "headphones",
  "speaker",
  "camera",
  "usb",
  "wireless",
];

const LONG_TAIL_QUERIES = [
  "laptop screen protector 15 inch",
  "usb-c charger fast charging",
  "wireless mouse ergonomic",
  "bluetooth headphones noise cancelling",
  "phone case waterproof",
  "hdmi cable 4k 10 feet",
  "portable battery pack 20000mah",
  "mechanical keyboard rgb",
  "webcam 1080p streaming",
  "external hard drive 2tb",
];

const BASE_URL = __ENV.BASE_URL || "http://reviews-service:3001";
const CACHE_URL = __ENV.CACHE_URL || "http://cache-service:3002";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomQuery() {
  const words = [
    "laptop",
    "phone",
    "charger",
    "cable",
    "wireless",
    "usb",
    "adapter",
  ];
  const count = Math.floor(Math.random() * 3) + 1;
  return Array.from({ length: count }, () => randomElement(words)).join(" ");
}

function recordMetrics(response, queryType) {
  try {
    const body = JSON.parse(response.body);
    const source = body.source;
    const duration = response.timings.duration;

    // Record source distribution
    if (source === "cache") {
      cacheHits.add(1);
      cacheHitRate.add(true);
      cacheLatency.add(duration);
      sourceCache.add(1);
    } else if (source === "search") {
      cacheMisses.add(1);
      cacheHitRate.add(false);
      searchLatency.add(duration);
      sourceSearch.add(1);
    } else if (source === "search-direct") {
      cacheMisses.add(1);
      cacheHitRate.add(false);
      searchLatency.add(duration);
      sourceSearchDirect.add(1);
    }

    // Record query type
    if (queryType === "popular") popularQueryRequests.add(1);
    else if (queryType === "long_tail") longTailQueryRequests.add(1);
    else if (queryType === "unique") uniqueQueryRequests.add(1);
  } catch (error) {
    console.error(`Failed to parse response: ${error.message}`);
  }
}

function fetchCacheStats() {
  try {
    const infoResponse = http.get(`${CACHE_URL}/cache/info`, {
      tags: { name: "cache_stats" },
    });

    if (infoResponse.status === 200) {
      const info = JSON.parse(infoResponse.body);
      if (info.utilization) {
        cacheUtilization.add(info.utilization.percentage || 0);
      }
    }

    const statsResponse = http.get(`${CACHE_URL}/cache/statistics`, {
      tags: { name: "cache_stats" },
    });

    if (statsResponse.status === 200) {
      const stats = JSON.parse(statsResponse.body);
      if (stats.evictionCount !== undefined) {
        evictionCount.add(stats.evictionCount);
      }
    }
  } catch (error) {
    // Silent fail
  }
}

// ============================================================
// SETUP & TEARDOWN
// ============================================================

export function setup() {
  console.log("🚀 Starting k6 Cache Load Test");
  console.log(`📊 Target URL: ${BASE_URL}`);
  console.log(`🗄️  Cache URL: ${CACHE_URL}`);
  console.log(`🔧 Environment: ${__ENV.NODE_ENV || "development"}`);
  console.log(`⚙️  Eviction Strategy: ${__ENV.EVICTION_STRATEGY || "lfu"}`);
  console.log("");

  // Health check
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(
      `Reviews Service health check failed: ${healthResponse.status}`
    );
  }

  const cacheHealthResponse = http.get(`${CACHE_URL}/health`);
  if (cacheHealthResponse.status !== 200) {
    throw new Error(
      `Cache Service health check failed: ${cacheHealthResponse.status}`
    );
  }

  console.log("✅ Health checks passed");

  // Flush cache before test
  const flushResponse = http.del(`${CACHE_URL}/cache/invalidate`);
  if (flushResponse.status === 200 || flushResponse.status === 204) {
    console.log("✅ Cache flushed");
  } else {
    console.warn("⚠️  Cache flush failed (non-critical)");
  }

  console.log("");
  console.log("⏱️  Test duration: ~15 minutes");
  console.log("");

  return {
    startTime: new Date().toISOString(),
    baseUrl: BASE_URL,
    cacheUrl: CACHE_URL,
  };
}

// ============================================================
// MAIN TEST SCENARIO
// ============================================================

export default function () {
  // Determine query strategy
  const rand = Math.random();
  let query, queryType;

  if (rand < 0.7) {
    // 70% - Popular queries (high cache hit expected)
    query = randomElement(POPULAR_QUERIES);
    queryType = "popular";
  } else if (rand < 0.9) {
    // 20% - Long-tail queries (medium cache hit)
    query = randomElement(LONG_TAIL_QUERIES);
    queryType = "long_tail";
  } else {
    // 10% - Unique queries (cache miss expected)
    query = generateRandomQuery();
    queryType = "unique";
  }

  const page = Math.floor(Math.random() * 3) + 1;
  const size = 10;

  // Execute search request
  group("Search Request", function () {
    const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&page=${page}&size=${size}`;

    const response = http.get(url, {
      tags: {
        name: "search",
        query_type: queryType,
      },
    });

    // Validate response
    check(response, {
      "status is 200": (r) => r.status === 200,
      "has items": (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch (error) {
          return false;
        }
      },
      "has source field": (r) => {
        try {
          const body = JSON.parse(r.body);
          return ["cache", "search", "search-direct"].includes(body.source);
        } catch (error) {
          return false;
        }
      },
      "response time < 10s": (r) => r.timings.duration < 10000,
    });

    // Record custom metrics
    recordMetrics(response, queryType);
  });

  // Periodically fetch cache statistics
  if (__VU % 10 === 0 && __ITER % 5 === 0) {
    fetchCacheStats();
  }

  // Think time
  sleep(Math.random() * 2 + 1);
}

// ============================================================
// TEARDOWN & CUSTOM SUMMARY
// ============================================================

export function teardown(data) {
  console.log("");
  console.log("🏁 Test completed");

  // Final cache statistics
  fetchCacheStats();

  const endTime = new Date().toISOString();
  console.log(`⏱️  Duration: ${data.startTime} → ${endTime}`);
  console.log("");
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const strategy = __ENV.EVICTION_STRATEGY || 'lfu';

  // Calculate cache performance metrics
  const totalRequests = (data.metrics.http_reqs && data.metrics.http_reqs.values && data.metrics.http_reqs.values.count) || 0;
  const cacheHitsTotal = (data.metrics.cache_hits_total && data.metrics.cache_hits_total.values && data.metrics.cache_hits_total.values.count) || 0;
  const cacheMissesTotal = (data.metrics.cache_misses_total && data.metrics.cache_misses_total.values && data.metrics.cache_misses_total.values.count) || 0;
  const cacheHitRateValue = (data.metrics.cache_hit_rate && data.metrics.cache_hit_rate.values && data.metrics.cache_hit_rate.values.rate) || 0;
  const errorRate = (data.metrics.http_req_failed && data.metrics.http_req_failed.values && data.metrics.http_req_failed.values.rate) || 0;
  const checksRate = (data.metrics.checks && data.metrics.checks.values && data.metrics.checks.values.rate) || 0;

  // Response time stats
  const httpDuration = (data.metrics.http_req_duration && data.metrics.http_req_duration.values) || {};
  const cacheDuration = (data.metrics.cache_response_time && data.metrics.cache_response_time.values) || {};
  const searchDuration = (data.metrics.search_response_time && data.metrics.search_response_time.values) || {};

  // Build custom summary output
  const customSummary = `
╔════════════════════════════════════════════════════════════╗
║                    Test Results Summary                    ║
╚════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CACHE PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cache Hit Rate:       ${(cacheHitRateValue * 100).toFixed(2)}% ${cacheHitRateValue >= 0.80 ? '✓' : '✗'}
  Total Requests:       ${totalRequests.toLocaleString()}
  Cache Hits:           ${cacheHitsTotal.toLocaleString()} (${cacheHitsTotal > 0 ? ((cacheHitsTotal/totalRequests)*100).toFixed(1) : 0}%)
  Cache Misses:         ${cacheMissesTotal.toLocaleString()} (${cacheMissesTotal > 0 ? ((cacheMissesTotal/totalRequests)*100).toFixed(1) : 0}%)
  Eviction Strategy:    ${strategy.toUpperCase()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ RESPONSE TIMES (milliseconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Overall Response Time:
    Avg: ${httpDuration.avg ? httpDuration.avg.toFixed(2) : 'N/A'}ms  |  P95: ${httpDuration['p(95)'] ? httpDuration['p(95)'].toFixed(2) : 'N/A'}ms  |  P99: ${httpDuration['p(99)'] ? httpDuration['p(99)'].toFixed(2) : 'N/A'}ms ${httpDuration['p(95)'] && httpDuration['p(95)'] < 100 ? '✓' : '✗'}

  Cache Hits (Fast Path):
    Avg: ${cacheDuration.avg ? cacheDuration.avg.toFixed(2) : 'N/A'}ms  |  P95: ${cacheDuration['p(95)'] ? cacheDuration['p(95)'].toFixed(2) : 'N/A'}ms  |  P99: ${cacheDuration['p(99)'] ? cacheDuration['p(99)'].toFixed(2) : 'N/A'}ms ${cacheDuration['p(95)'] && cacheDuration['p(95)'] < 50 ? '✓' : '✗'}

  Cache Misses (Slow Path):
    Avg: ${searchDuration.avg ? searchDuration.avg.toFixed(2) : 'N/A'}ms  |  P95: ${searchDuration['p(95)'] ? searchDuration['p(95)'].toFixed(2) : 'N/A'}ms  |  P99: ${searchDuration['p(99)'] ? searchDuration['p(99)'].toFixed(2) : 'N/A'}ms ${searchDuration['p(95)'] && searchDuration['p(95)'] < 8000 ? '✓' : '✗'}

  Performance Improvement: ${cacheDuration.avg && searchDuration.avg ? `${((searchDuration.avg / cacheDuration.avg - 1) * 100).toFixed(1)}x faster` : 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RELIABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Error Rate:           ${(errorRate * 100).toFixed(3)}% ${errorRate < 0.01 ? '✓' : '✗'}
  Checks Passed:        ${(checksRate * 100).toFixed(2)}% ${checksRate >= 0.95 ? '✓' : '✗'}
  VUs (Peak):           ${(data.metrics.vus_max && data.metrics.vus_max.values && data.metrics.vus_max.values.value) || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 QUERY DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Popular Queries:      ${(data.metrics.popular_query_requests && data.metrics.popular_query_requests.values && data.metrics.popular_query_requests.values.count) || 0} (70% target)
  Long-tail Queries:    ${(data.metrics.long_tail_query_requests && data.metrics.long_tail_query_requests.values && data.metrics.long_tail_query_requests.values.count) || 0} (20% target)
  Unique Queries:       ${(data.metrics.unique_query_requests && data.metrics.unique_query_requests.values && data.metrics.unique_query_requests.values.count) || 0} (10% target)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${(data.metrics.http_req_failed && data.metrics.http_req_failed.values && data.metrics.http_req_failed.values.rate >= 0.01) ||
  (data.metrics.cache_hit_rate && data.metrics.cache_hit_rate.values && data.metrics.cache_hit_rate.values.rate < 0.80) ||
  (data.metrics.checks && data.metrics.checks.values && data.metrics.checks.values.rate < 0.95) ?
  '⚠️  SOME THRESHOLDS FAILED - Check detailed metrics above' :
  '✅ ALL THRESHOLDS PASSED'}

`;

  return {
    'stdout': customSummary,
    [`/scripts/results/summary-${strategy}-${timestamp}.json`]: JSON.stringify(data, null, 2),
  };
}
