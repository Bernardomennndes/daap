// ============================================================
// K6 THRESHOLDS CONFIGURATION
// ============================================================
// Define SLAs and performance expectations for DAAP cache system

export const defaultThresholds = {
  // HTTP Request Failures
  'http_req_failed': ['rate<0.01'], // < 1% error rate

  // Response Time (Overall)
  'http_req_duration': [
    'p(50)<30',   // 50% of requests < 30ms
    'p(95)<100',  // 95% of requests < 100ms
    'p(99)<500',  // 99% of requests < 500ms
  ],

  // Cache Performance
  'cache_hit_rate': ['rate>0.80'],        // 80% cache hit rate
  'cache_response_time': ['p(95)<50'],    // 95% cache hits < 50ms
  'search_response_time': ['p(95)<8000'], // 95% search (miss) < 8s

  // Throughput
  'http_reqs': ['rate>50'], // > 50 requests per second

  // Checks (validation assertions)
  'checks': ['rate>0.95'], // 95% of checks pass
};

export const stressTestThresholds = {
  'http_req_failed': ['rate<0.01'],
  'http_req_duration': ['p(95)<200'], // More lenient under stress
  'eviction_triggered_total': ['count>0'], // Eviction MUST happen
  'checks': ['rate>0.90'], // 90% checks pass (more lenient)
};

export const strategyComparisonThresholds = (strategy) => ({
  [`cache_hits_${strategy}`]: ['count>500'],
  [`cache_latency_${strategy}`]: ['p(95)<50'],
  'http_req_failed': ['rate<0.01'],
  'checks': ['rate>0.95'],
});

export const aggressiveThresholds = {
  'http_req_failed': ['rate<0.005'], // < 0.5% error rate
  'http_req_duration': ['p(95)<50', 'p(99)<200'],
  'cache_hit_rate': ['rate>0.90'], // 90% cache hit rate
  'cache_response_time': ['p(99)<30'],
  'http_reqs': ['rate>100'],
  'checks': ['rate>0.98'],
};
