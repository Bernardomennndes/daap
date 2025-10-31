/**
 * Prometheus Metrics Module
 *
 * Inicializa e expõe métricas Prometheus via endpoint /metrics
 */

import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';

export interface MetricsConfig {
  serviceName: string;
  serviceVersion?: string;
  port?: number;
  endpoint?: string;
}

let prometheusExporter: PrometheusExporter | null = null;

/**
 * Inicializa o Prometheus exporter
 */
export function initializeMetrics(config: MetricsConfig): PrometheusExporter {
  const {
    serviceName,
    serviceVersion = '1.0.0',
    port = 9464,
    endpoint = '/metrics'
  } = config;

  if (prometheusExporter) {
    console.log(`[Prometheus] Metrics already initialized`);
    return prometheusExporter;
  }

  // Criar e iniciar o Prometheus exporter
  // Ele automaticamente cria um HTTP server e expõe /metrics
  prometheusExporter = new PrometheusExporter(
    {
      port,
      endpoint,
    },
    () => {
      console.log(`[Prometheus] Metrics server listening on http://localhost:${port}${endpoint}`);
      console.log(`[Prometheus] Metrics initialized for service: ${serviceName}`);
    }
  );

  return prometheusExporter;
}

/**
 * Obtém um meter para criar métricas customizadas
 */
export function getMeter(name: string, version: string = '1.0.0') {
  // Usa o MeterProvider global do OpenTelemetry
  return metrics.getMeter(name, version);
}

/**
 * Obtém o exporter Prometheus (para shutdown graceful)
 */
export function getPrometheusExporter(): PrometheusExporter | null {
  return prometheusExporter;
}

/**
 * Shutdown graceful do metrics exporter
 */
export async function shutdownMetrics(): Promise<void> {
  if (prometheusExporter) {
    await prometheusExporter.shutdown();
    console.log('[Prometheus] Metrics exporter shut down');
  }
}
