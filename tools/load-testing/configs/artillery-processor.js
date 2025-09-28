// Artillery processor for custom logic and metrics

module.exports = {
  // Set custom headers
  setHeaders: function(requestParams, context, ee, next) {
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['User-Agent'] = 'DAAP-LoadTest/1.0';
    requestParams.headers['X-Test-Session'] = context.vars.sessionId || 'unknown';
    return next();
  },

  // Log response times for analysis
  logResponseTime: function(requestParams, response, context, ee, next) {
    const responseTime = response.timings?.phases?.total || 0;
    
    if (responseTime > 1000) {
      console.log(`Slow response: ${requestParams.url} - ${responseTime}ms`);
    }
    
    // Store in context for analysis
    context.vars.lastResponseTime = responseTime;
    context.vars.totalResponseTime = (context.vars.totalResponseTime || 0) + responseTime;
    context.vars.requestCount = (context.vars.requestCount || 0) + 1;
    
    return next();
  },

  // Track cache performance
  trackCachePerformance: function(requestParams, response, context, ee, next) {
    const cacheStatus = response.headers['x-cache-status'] || 'unknown';
    const responseTime = response.timings?.phases?.total || 0;
    
    // Track cache hits vs misses
    if (cacheStatus === 'hit') {
      context.vars.cacheHits = (context.vars.cacheHits || 0) + 1;
      context.vars.cacheHitTime = (context.vars.cacheHitTime || 0) + responseTime;
    } else if (cacheStatus === 'miss') {
      context.vars.cacheMisses = (context.vars.cacheMisses || 0) + 1;
      context.vars.cacheMissTime = (context.vars.cacheMissTime || 0) + responseTime;
    }
    
    // Calculate running averages
    const totalRequests = (context.vars.cacheHits || 0) + (context.vars.cacheMisses || 0);
    if (totalRequests > 0) {
      context.vars.cacheHitRatio = (context.vars.cacheHits || 0) / totalRequests;
      context.vars.avgCacheHitTime = (context.vars.cacheHitTime || 0) / (context.vars.cacheHits || 1);
      context.vars.avgCacheMissTime = (context.vars.cacheMissTime || 0) / (context.vars.cacheMisses || 1);
    }
    
    return next();
  },

  // Custom error handling
  handleError: function(requestParams, response, context, ee, next) {
    if (response.statusCode >= 400) {
      console.log(`Error ${response.statusCode}: ${requestParams.url}`);
      context.vars.errorCount = (context.vars.errorCount || 0) + 1;
    }
    
    return next();
  },

  // Generate dynamic queries based on patterns
  generateDynamicQuery: function(context, events, done) {
    const queryPatterns = [
      'excellent phone',
      'poor battery',
      'fast delivery',
      'slow performance',
      'good quality',
      'bad service',
      'iPhone camera',
      'Samsung display',
      'Google search',
      'Microsoft software'
    ];
    
    const randomQuery = queryPatterns[Math.floor(Math.random() * queryPatterns.length)];
    context.vars.dynamicQuery = randomQuery;
    
    return done();
  },

  // Session initialization
  initSession: function(context, events, done) {
    context.vars.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    context.vars.sessionStartTime = Date.now();
    context.vars.requestCount = 0;
    context.vars.errorCount = 0;
    context.vars.cacheHits = 0;
    context.vars.cacheMisses = 0;
    
    return done();
  },

  // Session cleanup and reporting
  endSession: function(context, events, done) {
    const sessionDuration = Date.now() - (context.vars.sessionStartTime || Date.now());
    const avgResponseTime = (context.vars.totalResponseTime || 0) / (context.vars.requestCount || 1);
    
    console.log(`Session ${context.vars.sessionId} completed:`);
    console.log(`  Duration: ${sessionDuration}ms`);
    console.log(`  Requests: ${context.vars.requestCount || 0}`);
    console.log(`  Errors: ${context.vars.errorCount || 0}`);
    console.log(`  Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`  Cache Hit Ratio: ${((context.vars.cacheHitRatio || 0) * 100).toFixed(1)}%`);
    
    return done();
  },

  // Custom metrics collection
  collectMetrics: function(context, events, done) {
    const metrics = {
      sessionId: context.vars.sessionId,
      timestamp: new Date().toISOString(),
      requestCount: context.vars.requestCount || 0,
      errorCount: context.vars.errorCount || 0,
      cacheHits: context.vars.cacheHits || 0,
      cacheMisses: context.vars.cacheMisses || 0,
      cacheHitRatio: context.vars.cacheHitRatio || 0,
      avgResponseTime: (context.vars.totalResponseTime || 0) / (context.vars.requestCount || 1),
      avgCacheHitTime: context.vars.avgCacheHitTime || 0,
      avgCacheMissTime: context.vars.avgCacheMissTime || 0
    };
    
    // In a real scenario, you might send this to a metrics collector
    // For now, we'll just log it
    if (context.vars.requestCount > 0 && context.vars.requestCount % 100 === 0) {
      console.log('Metrics checkpoint:', JSON.stringify(metrics, null, 2));
    }
    
    return done();
  }
};
