// SDK initialization
export { initializeTelemetry, type TelemetryConfig } from './sdk';

// Tracing service
export { TracingService, getTracingService } from './tracer';

// Context propagation
export { injectTraceContext, extractTraceContext, withExtractedContext } from './context-propagation';

// Metrics (Prometheus)
export { initializeMetrics, getMeter, getPrometheusExporter, shutdownMetrics, type MetricsConfig } from './metrics';
export { CacheMetricsService } from './cache-metrics';

// Semantic conventions
export * from './constants';

// Re-export OpenTelemetry API (conveniente)
export { trace, context, SpanStatusCode } from '@opentelemetry/api';
export type { Span } from '@opentelemetry/api';
