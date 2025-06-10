import { Module } from '@nestjs/common';
import { CacheModule as CacheLibModule } from '../../lib/cache/module';
import { CacheService } from './service';
import { CacheController } from './controller';

@Module({
  imports: [CacheLibModule],
  controllers: [CacheController],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModuleDomain {}
