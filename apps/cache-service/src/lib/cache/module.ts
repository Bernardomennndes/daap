import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheAdapter } from './adapter';
import { RedisAdapter } from './implementations/redis.adapter';
import { DragonflyAdapter } from './implementations/dragonfly.adapter';
import { CacheConfig } from './types';
import { KeywordService } from './keyword.service';
import { EvictionStrategy } from './eviction-strategy.interface';
import { LFUStrategy, LRUStrategy, HybridStrategy } from './strategies';

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
    {
      provide: EvictionStrategy,
      useFactory: (
        cacheAdapter: CacheAdapter,
        keywordService: KeywordService,
        configService: ConfigService
      ) => {
        const strategyType = configService.get<string>('EVICTION_STRATEGY', 'lfu');

        switch (strategyType.toLowerCase()) {
          case 'lru':
            return new LRUStrategy(cacheAdapter, keywordService, configService);
          case 'hybrid':
            return new HybridStrategy(cacheAdapter, keywordService, configService);
          case 'lfu':
          default:
            return new LFUStrategy(cacheAdapter, keywordService, configService);
        }
      },
      inject: [CacheAdapter, KeywordService, ConfigService],
    },
  ],
  exports: [CacheAdapter, KeywordService, EvictionStrategy],
})
export class CacheModule {}

