import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { MainModule } from "./main.module";
import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { TracingInterceptor } from "./interceptors/logger/http-tracing.interceptor";
import { ILoggerService } from "./lib/modules/global/logger/adapter";

const NAME = "DAAP";
const VERSION = "1.0.0";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(MainModule, {
    bufferLogs: true,
    cors: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ errorHttpStatusCode: HttpStatus.PRECONDITION_FAILED })
  );

  const loggerService = app.get(ILoggerService);

  loggerService.setApplication(NAME);

  app.useGlobalInterceptors(
    new TracingInterceptor({ app: NAME, version: VERSION }, loggerService)
  );

  await app.listen(process.env.PORT || 3001);
}

bootstrap();
