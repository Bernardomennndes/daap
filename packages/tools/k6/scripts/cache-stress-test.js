import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge, Trend } from 'k6/metrics';

// ============================================================
// CUSTOM METRICS
// ============================================================

const evictionTriggered = new Counter('eviction_triggered_total');
const cacheEntriesCount = new Gauge('cache_entries_count');
const cacheUtilization = new Gauge('cache_utilization_percent');
const evictionLatency = new Trend('eviction_latency_ms');
const uniqueQueriesGenerated = new Counter('unique_queries_generated');

// ============================================================
// TEST CONFIGURATION
// ============================================================

export const options = {
  stages: [
    // Ramp-up
    { duration: '1m', target: 50, name: 'ramp_up' },

    // Heavy load to trigger eviction
    { duration: '10m', target: 200, name: 'stress' },

    // Ramp-down
    { duration: '1m', target: 0, name: 'ramp_down' },
  ],

  thresholds: {
    'eviction_triggered_total': ['count>0'], // Eviction MUST happen
    'http_req_duration': ['p(95)<200'],      // Still performant
    'http_req_failed': ['rate<0.01'],        // < 1% errors
    'checks': ['rate>0.95'],
  },

  tags: {
    test_type: 'cache_stress_test',
    environment: __ENV.NODE_ENV || 'development',
    eviction_strategy: __ENV.EVICTION_STRATEGY || 'lfu',
  },

  summaryTrendStats: ['min', 'avg', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ============================================================
// CONSTANTS
// ============================================================

const BASE_URL = __ENV.BASE_URL || 'http://reviews-service:3001';
const CACHE_URL = __ENV.CACHE_URL || 'http://cache-service:3002';

// ============================================================
// SETUP & TEARDOWN
// ============================================================

export function setup() {
  console.log('💪 Starting k6 Cache Stress Test');
  console.log(`📊 Target: Trigger cache eviction under heavy load`);
  console.log(`🔧 Eviction Strategy: ${__ENV.EVICTION_STRATEGY || 'lfu'}`);
  console.log('');

  // Health check
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`Health check failed: ${healthResponse.status}`);
  }

  // Flush cache
  http.del(`${CACHE_URL}/cache/invalidate`);
  console.log('✅ Cache flushed');

  // Get initial cache info
  const infoResponse = http.get(`${CACHE_URL}/cache/info`);
  if (infoResponse.status === 200) {
    const info = JSON.parse(infoResponse.body);
    console.log(`📦 Cache Max Entries: ${info.maxEntries || 'unknown'}`);
  }

  console.log('');
  console.log('⏱️  Test duration: ~12 minutes');
  console.log('⚠️  This test will generate MANY unique queries to fill cache');
  console.log('');

  return {
    startTime: new Date().toISOString(),
  };
}

// ============================================================
// MAIN TEST SCENARIO
// ============================================================

export default function () {
  // Generate unique query to force cache misses and fill cache
  const uniqueQuery = `stress-test-${__VU}-${__ITER}-${Date.now()}`;
  uniqueQueriesGenerated.add(1);

  const url = `${BASE_URL}/search?q=${encodeURIComponent(uniqueQuery)}&page=1&size=10`;

  const response = http.get(url, {
    tags: { name: 'unique_query' },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch (error) {
        return false;
      }
    },
  });

  // Check cache statistics every 10 iterations
  if (__ITER % 10 === 0) {
    const statsResponse = http.get(`${CACHE_URL}/cache/statistics`, {
      tags: { name: 'cache_stats' },
    });

    if (statsResponse.status === 200) {
      try {
        const stats = JSON.parse(statsResponse.body);

        if (stats.totalEntries !== undefined) {
          cacheEntriesCount.add(stats.totalEntries);
        }

        if (stats.evictionCount !== undefined && stats.evictionCount > 0) {
          evictionTriggered.add(1);
        }
      } catch (error) {
        // Silent fail
      }
    }

    const infoResponse = http.get(`${CACHE_URL}/cache/info`, {
      tags: { name: 'cache_info' },
    });

    if (infoResponse.status === 200) {
      try {
        const info = JSON.parse(infoResponse.body);

        if (info.utilization && info.utilization.percentage !== undefined) {
          cacheUtilization.add(info.utilization.percentage);
        }
      } catch (error) {
        // Silent fail
      }
    }
  }

  // Minimal sleep to maintain aggressive load
  sleep(0.1);
}

// ============================================================
// TEARDOWN & CUSTOM SUMMARY
// ============================================================

export function teardown(data) {
  console.log('');
  console.log('🏁 Stress Test Completed');

  // Final statistics
  const statsResponse = http.get(`${CACHE_URL}/cache/statistics`);
  if (statsResponse.status === 200) {
    const stats = JSON.parse(statsResponse.body);
    console.log('');
    console.log('📊 Final Cache Statistics:');
    console.log(`   Total Entries: ${stats.totalEntries || 'N/A'}`);
    console.log(`   Eviction Count: ${stats.evictionCount || 0}`);
    console.log(`   Eviction Rate: ${stats.evictionRate || 'N/A'}`);
  }

  const infoResponse = http.get(`${CACHE_URL}/cache/info`);
  if (infoResponse.status === 200) {
    const info = JSON.parse(infoResponse.body);
    const percentage = (info.utilization && info.utilization.percentage) || 'N/A';
    console.log(`   Utilization: ${percentage}%`);
  }

  console.log('');
  console.log('⏱️  Duration:', data.startTime, '→', new Date().toISOString());
  console.log('');
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const strategy = __ENV.EVICTION_STRATEGY || 'lfu';

  // Calculate metrics
  const totalRequests = (data.metrics.http_reqs && data.metrics.http_reqs.values && data.metrics.http_reqs.values.count) || 0;
  const uniqueQueries = (data.metrics.unique_queries_generated && data.metrics.unique_queries_generated.values && data.metrics.unique_queries_generated.values.count) || 0;
  const evictions = (data.metrics.eviction_triggered_total && data.metrics.eviction_triggered_total.values && data.metrics.eviction_triggered_total.values.count) || 0;
  const maxEntries = (data.metrics.cache_entries_count && data.metrics.cache_entries_count.values && data.metrics.cache_entries_count.values.max) || 0;
  const avgUtilization = (data.metrics.cache_utilization_percent && data.metrics.cache_utilization_percent.values && data.metrics.cache_utilization_percent.values.avg) || 0;
  const errorRate = (data.metrics.http_req_failed && data.metrics.http_req_failed.values && data.metrics.http_req_failed.values.rate) || 0;
  const checksRate = (data.metrics.checks && data.metrics.checks.values && data.metrics.checks.values.rate) || 0;

  // Response time stats
  const httpDuration = (data.metrics.http_req_duration && data.metrics.http_req_duration.values) || {};

  // Build custom summary output
  const customSummary = `
╔════════════════════════════════════════════════════════════╗
║               Stress Test Results Summary                  ║
╚════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💪 STRESS TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test Goal:            Trigger cache eviction under load
  Eviction Strategy:    ${strategy.toUpperCase()}
  Total Requests:       ${totalRequests.toLocaleString()}
  Unique Queries:       ${uniqueQueries.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  CACHE EVICTION METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Evictions Triggered:  ${evictions > 0 ? evictions.toLocaleString() : 'NONE'} ${evictions > 0 ? '✓' : '✗'}
  Max Cache Entries:    ${maxEntries.toLocaleString()}
  Avg Cache Utilization: ${avgUtilization.toFixed(2)}%

${evictions > 0 ?
  `  Status:               ✅ Eviction successfully triggered` :
  `  Status:               ⚠️  No evictions detected - cache may not be full`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ RESPONSE TIMES UNDER STRESS (milliseconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Avg: ${httpDuration.avg ? httpDuration.avg.toFixed(2) : 'N/A'}ms  |  P95: ${httpDuration['p(95)'] ? httpDuration['p(95)'].toFixed(2) : 'N/A'}ms  |  P99: ${httpDuration['p(99)'] ? httpDuration['p(99)'].toFixed(2) : 'N/A'}ms ${httpDuration['p(95)'] && httpDuration['p(95)'] < 200 ? '✓' : '✗'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RELIABILITY UNDER STRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Error Rate:           ${(errorRate * 100).toFixed(3)}% ${errorRate < 0.01 ? '✓' : '✗'}
  Checks Passed:        ${(checksRate * 100).toFixed(2)}% ${checksRate >= 0.95 ? '✓' : '✗'}
  VUs (Peak):           ${(data.metrics.vus_max && data.metrics.vus_max.values && data.metrics.vus_max.values.value) || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${evictions === 0 ||
  (data.metrics.http_req_failed && data.metrics.http_req_failed.values && data.metrics.http_req_failed.values.rate >= 0.01) ||
  (data.metrics.checks && data.metrics.checks.values && data.metrics.checks.values.rate < 0.95) ?
  '⚠️  SOME THRESHOLDS FAILED - Check detailed metrics above' :
  '✅ ALL THRESHOLDS PASSED - Eviction working correctly under stress'}

`;

  return {
    'stdout': customSummary,
    [`/scripts/results/stress-test-${strategy}-${timestamp}.json`]: JSON.stringify(data, null, 2),
  };
}
