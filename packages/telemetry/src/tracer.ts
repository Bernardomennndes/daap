import { trace, Span, SpanStatusCode, Context, context } from '@opentelemetry/api';

export class TracingService {
  private readonly tracer;

  constructor(serviceName: string) {
    this.tracer = trace.getTracer(serviceName, '1.0.0');
  }

  /**
   * Inicia um span ativo (contexto propagado automaticamente)
   */
  async startActiveSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      if (attributes) {
        span.setAttributes(attributes);
      }

      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const err = error as Error;
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Obtém o trace ID atual (para logs correlacionados)
   */
  getCurrentTraceId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    return activeSpan?.spanContext().traceId;
  }

  /**
   * Adiciona atributos ao span ativo
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }

  /**
   * Registra evento no span ativo
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    }
  }

  /**
   * Obtém tracer raw (para uso avançado)
   */
  getTracer() {
    return this.tracer;
  }
}

// Export singleton factory
let tracingServiceInstance: TracingService | null = null;

export function getTracingService(serviceName?: string): TracingService {
  if (!tracingServiceInstance && serviceName) {
    tracingServiceInstance = new TracingService(serviceName);
  }
  if (!tracingServiceInstance) {
    throw new Error('TracingService not initialized. Call getTracingService(serviceName) first.');
  }
  return tracingServiceInstance;
}
