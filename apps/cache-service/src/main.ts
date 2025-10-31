// ⚠️ SEMPRE PRIMEIRO IMPORT - Inicializa OpenTelemetry antes de tudo
import "./tracing";

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { MainModule } from "./main.module";
import { SecretsService } from "./lib/modules/global/secrets/service";
import { initializeMetrics } from "@daap/telemetry";

async function bootstrap() {
  try {
    // Inicializar Prometheus metrics
    initializeMetrics({
      serviceName: "cache-service",
      port: 9464,
      endpoint: "/metrics",
    });

    const app = await NestFactory.create(MainModule, {
      logger: ["error", "warn", "log", "verbose", "debug"],
    });

    const secretsService = app.get(SecretsService);

    await app.listen(secretsService.PORT);
  } catch (error) {
    console.error("Failed to start Cache Service:", error);
    process.exit(1);
  }
}
bootstrap();
