import 'reflect-metadata';
import { NestFactory } from "@nestjs/core";
import { MainModule } from "./main.module";

async function bootstrap() {
  console.log('Starting Cache Service...');
  
  try {
    const app = await NestFactory.create(MainModule, {
      logger: ['error', 'warn', 'log', 'verbose', 'debug'],
    });

    console.log('Cache Service created successfully');
    await app.listen(process.env.PORT || 3002);
    console.log(`Cache Service listening on port ${process.env.PORT || 3002}`);
  } catch (error) {
    console.error('Failed to start Cache Service:', error);
    process.exit(1);
  }
}
bootstrap();
