import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SecretsService } from './secrets/service';

@Global()
@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 5,
    }),
  ],
  providers: [SecretsService],
  exports: [SecretsService, HttpModule],
})
export class GlobalModule {}
