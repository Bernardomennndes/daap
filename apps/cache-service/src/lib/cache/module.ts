import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheAdapter } from './adapter';
import { RedisAdapter } from './implementations/redis.adapter';
import { DragonflyAdapter } from './implementations/dragonfly.adapter';
import { CacheConfig } from './types';
import { KeywordService } from './keyword.service';
import { LFUManager } from './lfu-manager.service';

@Module({
  providers: [
    {
      provide: CacheAdapter,
      useFactory: (configService: ConfigService) => {
        const cacheType = configService.get<string>('CACHE_TYPE', 'redis');
        const config: CacheConfig = {
          host: configService.get<string>('CACHE_HOST', 'localhost'),
          port: configService.get<number>('CACHE_PORT', 6379),
          password: configService.get<string>('CACHE_PASSWORD'),
          db: configService.get<number>('CACHE_DB', 0),
          ttl: configService.get<number>('CACHE_TTL', 3600),
        };

        switch (cacheType) {
          case 'dragonfly':
            return new DragonflyAdapter(config);
          case 'redis':
          default:
            return new RedisAdapter(config);
        }
      },
      inject: [ConfigService],
    },
    KeywordService,
    LFUManager,
  ],
  exports: [CacheAdapter, KeywordService, LFUManager],
})
export class CacheModule {}

