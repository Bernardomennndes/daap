import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ============================================================
// CUSTOM METRICS (Strategy-specific)
// ============================================================

const strategy = __ENV.EVICTION_STRATEGY || 'lfu';

const strategyHits = new Counter(`cache_hits_${strategy}`);
const strategyMisses = new Counter(`cache_misses_${strategy}`);
const strategyHitRate = new Rate(`cache_hit_rate_${strategy}`);
const strategyLatency = new Trend(`cache_latency_${strategy}`);

// ============================================================
// TEST CONFIGURATION
// ============================================================

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
  },

  thresholds: {
    [`cache_hits_${strategy}`]: ['count>500'],
    [`cache_latency_${strategy}`]: ['p(95)<50'],
    'http_req_failed': ['rate<0.01'],
    'checks': ['rate>0.95'],
  },

  tags: {
    test_type: 'strategy_comparison',
    environment: __ENV.NODE_ENV || 'development',
    eviction_strategy: strategy,
  },

  summaryTrendStats: ['min', 'avg', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ============================================================
// TEST DATA
// ============================================================

const QUERIES = [
  'laptop', 'phone', 'charger', 'cable', 'battery',
  'mouse', 'keyboard', 'headphones', 'speaker', 'camera'
];

const BASE_URL = __ENV.BASE_URL || 'http://reviews-service:3001';
const CACHE_URL = __ENV.CACHE_URL || 'http://cache-service:3002';

// ============================================================
// SETUP & TEARDOWN
// ============================================================

export function setup() {
  console.log(`🧪 Testing eviction strategy: ${strategy.toUpperCase()}`);
  console.log('📊 Configuration:');
  console.log(`   Virtual Users: 50`);
  console.log(`   Duration: 5 minutes`);
  console.log(`   Queries: ${QUERIES.length} popular terms`);
  console.log('');

  // Flush cache
  const flushResponse = http.del(`${CACHE_URL}/cache/invalidate`);
  if (flushResponse.status === 200 || flushResponse.status === 204) {
    console.log('✅ Cache flushed');
  }

  console.log('');

  return {
    startTime: new Date().toISOString(),
    strategy: strategy,
  };
}

// ============================================================
// MAIN TEST SCENARIO
// ============================================================

export default function () {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const page = Math.floor(Math.random() * 2) + 1; // Pages 1-2
  const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&page=${page}&size=10`;

  const response = http.get(url, {
    tags: {
      name: 'search',
      strategy: strategy,
    },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
  });

  try {
    const body = JSON.parse(response.body);
    const source = body.source;
    const duration = response.timings.duration;

    if (source === 'cache') {
      strategyHits.add(1);
      strategyHitRate.add(true);
      strategyLatency.add(duration);
    } else {
      strategyMisses.add(1);
      strategyHitRate.add(false);
    }
  } catch (error) {
    // Silent fail
  }

  sleep(1);
}

// ============================================================
// TEARDOWN & REPORTING
// ============================================================

export function teardown(data) {
  console.log('');
  console.log(`✅ Strategy ${strategy.toUpperCase()} test completed`);

  // Get final cache statistics
  const statsResponse = http.get(`${CACHE_URL}/cache/statistics`);
  if (statsResponse.status === 200) {
    const stats = JSON.parse(statsResponse.body);
    console.log('');
    console.log('📊 Final Statistics:');
    console.log(`   Eviction Count: ${stats.evictionCount || 0}`);
    console.log(`   Total Entries: ${stats.totalEntries || 'N/A'}`);
  }

  console.log('');
  console.log('⏱️  Duration:', data.startTime, '→', new Date().toISOString());
  console.log('');
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    'stdout': textSummary(data, { indent: '  ', enableColors: true }),
    [`/scripts/results/comparison-${strategy}-${timestamp}.json`]: JSON.stringify(data, null, 2),
  };
}
