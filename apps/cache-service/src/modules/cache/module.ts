import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule as CacheLibModule } from '../../lib/cache/module';
import { CacheService } from './service';
import { CacheController } from './controller';

@Module({
  imports: [
    CacheLibModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 5,
    }),
  ],
  controllers: [CacheController],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModuleDomain {}
