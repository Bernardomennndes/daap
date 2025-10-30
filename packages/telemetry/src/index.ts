// SDK initialization
export { initializeTelemetry, type TelemetryConfig } from './sdk';

// Tracing service
export { TracingService, getTracingService } from './tracer';

// Context propagation
export { injectTraceContext, extractTraceContext, withExtractedContext } from './context-propagation';

// Semantic conventions
export * from './constants';

// Re-export OpenTelemetry API (conveniente)
export { trace, context, SpanStatusCode } from '@opentelemetry/api';
export type { Span } from '@opentelemetry/api';
