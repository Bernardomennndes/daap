import { propagation, context, Context } from '@opentelemetry/api';

/**
 * Injeta trace context em HTTP headers (para Axios)
 * Uso: const headers = injectTraceContext({});
 */
export function injectTraceContext(headers: Record<string, string> = {}): Record<string, string> {
  const carrier = { ...headers };
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extrai trace context de HTTP headers (para NestJS interceptor)
 * Uso: const ctx = extractTraceContext(request.headers);
 */
export function extractTraceContext(headers: Record<string, any>): Context {
  return propagation.extract(context.active(), headers);
}

/**
 * Wrapper para executar função com context extraído
 */
export async function withExtractedContext<T>(
  headers: Record<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  const ctx = extractTraceContext(headers);
  return context.with(ctx, fn);
}
