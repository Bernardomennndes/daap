// ⚠️ SEMPRE PRIMEIRO IMPORT - Inicializa OpenTelemetry antes de tudo
import "./tracing";

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MainModule } from './main.module';
import { SecretsService } from './lib/modules/global/secrets/service';
import { initializeMetrics } from '@daap/telemetry';

async function bootstrap() {
  // Inicializar Prometheus metrics
  initializeMetrics({
    serviceName: 'search-service',
    port: 9464,
    endpoint: '/metrics',
  });

  const app = await NestFactory.create(MainModule);

  const secretsService = app.get(SecretsService);

  await app.listen(secretsService.searchAPI.port);
}
bootstrap();
