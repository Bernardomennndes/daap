// ⚠️ SEMPRE PRIMEIRO IMPORT - Inicializa OpenTelemetry antes de tudo
import "./tracing";

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { MainModule } from "./main.module";
import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { TracingInterceptor } from "./interceptors/logger/http-tracing.interceptor";
import { ILoggerService } from "./lib/modules/global/logger/adapter";
import { ISecretsService } from "./lib/modules/global/secrets/adapter";
import { initializeMetrics } from "@daap/telemetry";

const NAME = "DAAP";
const VERSION = "1.0.0";

async function bootstrap() {
  // Inicializar Prometheus metrics
  initializeMetrics({
    serviceName: "reviews-service",
    port: 9464,
    endpoint: "/metrics",
  });

  const app = await NestFactory.create<NestExpressApplication>(MainModule, {
    bufferLogs: true,
    cors: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ errorHttpStatusCode: HttpStatus.PRECONDITION_FAILED })
  );

  const loggerService = app.get(ILoggerService);
  const secretsService = app.get(ISecretsService);

  loggerService.setApplication(NAME);

  app.useGlobalInterceptors(
    new TracingInterceptor({ app: NAME, version: VERSION }, loggerService)
  );

  await app.listen(secretsService.reviewsAPI.port);
}

bootstrap();
