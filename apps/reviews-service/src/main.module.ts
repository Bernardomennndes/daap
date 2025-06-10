import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchModule } from './modules/search/module';
import { HealthModule } from './modules/health/module';
import { GlobalModule } from './lib/modules/global/module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GlobalModule,
    SearchModule,
    HealthModule,
  ],
})
export class MainModule {}
