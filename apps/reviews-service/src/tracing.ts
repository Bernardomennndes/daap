import { initializeTelemetry } from '@daap/telemetry';

// ⚠️ IMPORTANTE: Inicializar ANTES de qualquer import do NestJS
initializeTelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME || 'reviews-service',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
