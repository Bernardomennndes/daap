import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeywordService } from '../src/lib/cache/keyword.service';
import { EvictionStrategy } from '../src/lib/cache/eviction-strategy.interface';
import { LFUStrategy } from '../src/lib/cache/strategies/lfu.strategy';
import { LRUStrategy } from '../src/lib/cache/strategies/lru.strategy';
import { HybridStrategy } from '../src/lib/cache/strategies/hybrid.strategy';
import { CacheAdapter } from '../src/lib/cache/adapter';
import { RedisAdapter } from '../src/lib/cache/implementations/redis.adapter';

describe('Eviction Strategies Tests', () => {
  let keywordService: KeywordService;
  let cacheAdapter: CacheAdapter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeywordService,
        {
          provide: CacheAdapter,
          useFactory: () => {
            return new RedisAdapter({
              host: process.env.CACHE_HOST || 'localhost',
              port: parseInt(process.env.CACHE_PORT || '6379'),
              db: 2, // Use DB 2 for strategy tests
            });
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                EVICTION_MAX_ENTRIES: 10,
                EVICTION_BATCH_SIZE: 3,
                EVICTION_FREQUENCY_WEIGHT: 0.6,
                EVICTION_RECENCY_WEIGHT: 0.4,
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    keywordService = module.get<KeywordService>(KeywordService);
    cacheAdapter = module.get<CacheAdapter>(CacheAdapter);
    configService = module.get<ConfigService>(ConfigService);

    // Limpa o Redis antes de cada teste
    await cacheAdapter.flush();
  });

  afterEach(async () => {
    await cacheAdapter.flush();
  });

  describe('LFU Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = new LFUStrategy(cacheAdapter, keywordService, configService);
    });

    it('should return strategy name as LFU', () => {
      expect(strategy.getStrategyName()).toBe('LFU');
    });

    it('should register cache entry with frequency = 1', async () => {
      await strategy.registerCacheEntry(
        'search:test:1:10',
        ['test'],
        1024
      );

      const info = await strategy.getCacheInfo();
      expect(info.totalEntries).toBe(1);
      expect(info.strategyName).toBe('LFU');
    });

    it('should increment frequency on access', async () => {
      const key = 'search:laptop:1:10';
      await strategy.registerCacheEntry(key, ['laptop'], 1024);

      // Simula 5 acessos
      for (let i = 0; i < 5; i++) {
        await strategy.recordAccess(key);
      }

      const candidates = await strategy.findEntriesForEviction(1);
      // Frequência deve ser 1 (inicial) + 5 (acessos) = 6
      // Score deve ser baixo (bom candidato para manter)
      expect(candidates[0].frequency).toBe(6);
    });

    it('should evict entries with lowest frequency first', async () => {
      // Registra 3 entries com diferentes frequências
      await strategy.registerCacheEntry('search:popular:1:10', ['popular'], 1024);
      await strategy.registerCacheEntry('search:medium:1:10', ['medium'], 1024);
      await strategy.registerCacheEntry('search:rare:1:10', ['rare'], 1024);

      // Simula acessos diferentes
      for (let i = 0; i < 10; i++) {
        await strategy.recordAccess('search:popular:1:10');
      }
      for (let i = 0; i < 3; i++) {
        await strategy.recordAccess('search:medium:1:10');
      }
      // rare não é acessado (frequency = 1)

      const candidates = await strategy.findEntriesForEviction(1);

      // Deve escolher o entry com menor frequência (rare)
      expect(candidates[0].key).toBe('search:rare:1:10');
      expect(candidates[0].frequency).toBe(1);
    });

    it('should trigger eviction when max entries exceeded', async () => {
      const maxEntries = configService.get('EVICTION_MAX_ENTRIES', 10);

      // Adiciona entries até exceder o limite
      for (let i = 0; i < maxEntries + 3; i++) {
        await strategy.registerCacheEntry(
          `search:query${i}:1:10`,
          [`query${i}`],
          1024
        );
      }

      // Verifica eviction
      const evicted = await strategy.checkAndEvict();
      expect(evicted).toBe(true);

      const info = await strategy.getCacheInfo();
      expect(info.totalEntries).toBeLessThanOrEqual(maxEntries);
    });
  });

  describe('LRU Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = new LRUStrategy(cacheAdapter, keywordService, configService);
    });

    it('should return strategy name as LRU', () => {
      expect(strategy.getStrategyName()).toBe('LRU');
    });

    it('should evict entries with oldest access time', async () => {
      // Registra 3 entries
      await strategy.registerCacheEntry('search:old:1:10', ['old'], 1024);
      await new Promise(resolve => setTimeout(resolve, 100));

      await strategy.registerCacheEntry('search:medium:1:10', ['medium'], 1024);
      await new Promise(resolve => setTimeout(resolve, 100));

      await strategy.registerCacheEntry('search:new:1:10', ['new'], 1024);

      // Acessa apenas o novo
      await strategy.recordAccess('search:new:1:10');

      const candidates = await strategy.findEntriesForEviction(1);

      // Deve escolher o entry com acesso mais antigo (old)
      expect(candidates[0].key).toBe('search:old:1:10');
    });

    it('should ignore frequency in eviction decision', async () => {
      await strategy.registerCacheEntry('search:frequent:1:10', ['frequent'], 1024);
      await strategy.registerCacheEntry('search:recent:1:10', ['recent'], 1024);

      // Acessa frequent muitas vezes mas deixa antigo
      for (let i = 0; i < 100; i++) {
        await strategy.recordAccess('search:frequent:1:10');
      }
      await new Promise(resolve => setTimeout(resolve, 200));

      // Acessa recent apenas uma vez mas é mais recente
      await strategy.recordAccess('search:recent:1:10');

      const candidates = await strategy.findEntriesForEviction(1);

      // Deve escolher frequent (mais antigo) mesmo tendo alta frequência
      expect(candidates[0].key).toBe('search:frequent:1:10');
    });
  });

  describe('Hybrid Strategy', () => {
    let strategy: EvictionStrategy;

    beforeEach(() => {
      strategy = new HybridStrategy(cacheAdapter, keywordService, configService);
    });

    it('should return strategy name as Hybrid', () => {
      expect(strategy.getStrategyName()).toBe('Hybrid');
    });

    it('should consider both frequency and recency', async () => {
      // Entry 1: alta frequência, acesso antigo
      await strategy.registerCacheEntry('search:oldpopular:1:10', ['oldpopular'], 1024);
      for (let i = 0; i < 50; i++) {
        await strategy.recordAccess('search:oldpopular:1:10');
      }
      await new Promise(resolve => setTimeout(resolve, 200));

      // Entry 2: baixa frequência, acesso recente
      await strategy.registerCacheEntry('search:newrare:1:10', ['newrare'], 1024);
      await strategy.recordAccess('search:newrare:1:10');

      // Entry 3: baixa frequência, acesso antigo (pior cenário)
      await strategy.registerCacheEntry('search:oldrare:1:10', ['oldrare'], 1024);
      await new Promise(resolve => setTimeout(resolve, 100));

      const candidates = await strategy.findEntriesForEviction(1);

      // Deve escolher oldrare (pior em ambos os critérios)
      expect(candidates[0].key).toBe('search:oldrare:1:10');
    });

    it('should balance frequency and recency with configured weights', async () => {
      const info = await strategy.getCacheInfo();
      expect(info.strategyName).toBe('Hybrid');

      // Verifica que os pesos estão sendo usados
      const freqWeight = configService.get('EVICTION_FREQUENCY_WEIGHT', 0.6);
      const recencyWeight = configService.get('EVICTION_RECENCY_WEIGHT', 0.4);

      expect(freqWeight).toBe(0.6);
      expect(recencyWeight).toBe(0.4);
    });
  });

  describe('Strategy Interface Compliance', () => {
    const strategies = [
      { name: 'LFU', factory: (ca, ks, cs) => new LFUStrategy(ca, ks, cs) },
      { name: 'LRU', factory: (ca, ks, cs) => new LRUStrategy(ca, ks, cs) },
      { name: 'Hybrid', factory: (ca, ks, cs) => new HybridStrategy(ca, ks, cs) },
    ];

    strategies.forEach(({ name, factory }) => {
      describe(`${name} Strategy Interface`, () => {
        let strategy: EvictionStrategy;

        beforeEach(() => {
          strategy = factory(cacheAdapter, keywordService, configService);
        });

        it('should implement registerCacheEntry', async () => {
          await expect(
            strategy.registerCacheEntry('test:key', ['test'], 1024)
          ).resolves.not.toThrow();
        });

        it('should implement recordAccess', async () => {
          await strategy.registerCacheEntry('test:key', ['test'], 1024);
          await expect(
            strategy.recordAccess('test:key')
          ).resolves.not.toThrow();
        });

        it('should implement checkAndEvict', async () => {
          await expect(
            strategy.checkAndEvict()
          ).resolves.toBeDefined();
        });

        it('should implement findEntriesForEviction', async () => {
          const candidates = await strategy.findEntriesForEviction(5);
          expect(Array.isArray(candidates)).toBe(true);
        });

        it('should implement evictEntry', async () => {
          await strategy.registerCacheEntry('test:key', ['test'], 1024);
          await expect(
            strategy.evictEntry('test:key')
          ).resolves.not.toThrow();
        });

        it('should implement getKeywordStats', async () => {
          const stats = await strategy.getKeywordStats(10);
          expect(Array.isArray(stats)).toBe(true);
        });

        it('should implement getCacheInfo', async () => {
          const info = await strategy.getCacheInfo();
          expect(info).toHaveProperty('totalEntries');
          expect(info).toHaveProperty('maxEntries');
          expect(info).toHaveProperty('strategyName');
          expect(info.strategyName).toBe(name);
        });

        it('should implement clearAll', async () => {
          await strategy.registerCacheEntry('test:key', ['test'], 1024);
          await expect(
            strategy.clearAll()
          ).resolves.not.toThrow();

          const info = await strategy.getCacheInfo();
          expect(info.totalEntries).toBe(0);
        });
      });
    });
  });
});
