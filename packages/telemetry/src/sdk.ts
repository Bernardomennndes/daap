import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  otlpEndpoint?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export function initializeTelemetry(config: TelemetryConfig): NodeSDK {
  const {
    serviceName,
    serviceVersion = '1.0.0',
    environment = process.env.NODE_ENV || 'development',
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4317',
    logLevel = 'info',
  } = config;

  // Resource: identifica o serviço no Jaeger
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
  });

  // Exporter: envia spans para Jaeger via OTLP/gRPC
  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
    // Retry configuration
    timeoutMillis: 5000,
  });

  // SDK initialization
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Auto-instrumentações (capturam HTTP, etc.)
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (req) => {
            // Ignorar health checks para reduzir noise
            const url = (req as any).url;
            return url?.includes('/health') || url?.includes('/metrics') || false;
          },
          requestHook: (span, request) => {
            // Adicionar atributos customizados
            const url = (request as any).url;
            const headers = (request as any).headers;
            span.setAttributes({
              'http.target': url || '',
              'http.user_agent': headers?.['user-agent'] || 'unknown',
            });
          },
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-nestjs-core': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-mongodb': {
          enabled: true,
          enhancedDatabaseReporting: true, // Captura query details
        },
        // Desabilitar instrumentações não usadas
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('[OpenTelemetry] SDK shut down successfully'))
      .catch((error) => console.error('[OpenTelemetry] Shutdown error', error))
      .finally(() => process.exit(0));
  });

  sdk.start();
  console.log(`[OpenTelemetry] Initialized for service: ${serviceName}`);

  return sdk;
}
