import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeywordService } from '../src/lib/cache/keyword.service';
import { LFUManager } from '../src/lib/cache/lfu-manager.service';
import { CacheService } from '../src/modules/cache/service';
import { CacheAdapter } from '../src/lib/cache/adapter';
import { RedisAdapter } from '../src/lib/cache/implementations/redis.adapter';

describe('LFU Implementation Tests', () => {
  let keywordService: KeywordService;
  let lfuManager: LFUManager;
  let cacheService: CacheService;
  let cacheAdapter: CacheAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeywordService,
        LFUManager,
        CacheService,
        {
          provide: CacheAdapter,
          useFactory: () => {
            return new RedisAdapter({
              host: process.env.CACHE_HOST || 'localhost',
              port: parseInt(process.env.CACHE_PORT || '6379'),
              db: 1, // Use DB 1 for tests
            });
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                LFU_MAX_ENTRIES: 100,
                LFU_EVICTION_BATCH_SIZE: 10,
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    keywordService = module.get<KeywordService>(KeywordService);
    lfuManager = module.get<LFUManager>(LFUManager);
    cacheService = module.get<CacheService>(CacheService);
    cacheAdapter = module.get<CacheAdapter>(CacheAdapter);

    // Clean up before tests
    await cacheAdapter.flush();
  });

  afterEach(async () => {
    // Clean up after tests
    await cacheAdapter.flush();
    await cacheAdapter.disconnect();
  });

  describe('KeywordService', () => {
    it('should extract keywords from a query', () => {
      const query = 'best restaurants in Lisbon';
      const keywords = keywordService.extractKeywords(query);

      expect(keywords).toContain('best');
      expect(keywords).toContain('restaurants');
      expect(keywords).toContain('lisbon');
      expect(keywords).not.toContain('in'); // stop word
    });

    it('should remove stop words in Portuguese', () => {
      const query = 'os melhores hotéis em Lisboa';
      const keywords = keywordService.extractKeywords(query);

      expect(keywords).toContain('melhores');
      expect(keywords).toContain('hotéis');
      expect(keywords).toContain('lisboa');
      expect(keywords).not.toContain('os'); // stop word
      expect(keywords).not.toContain('em'); // stop word
    });

    it('should remove duplicates', () => {
      const query = 'hotel hotel hotels';
      const keywords = keywordService.extractKeywords(query);

      expect(keywords.filter(k => k === 'hotel').length).toBe(1);
    });

    it('should calculate similarity between keyword lists', () => {
      const keywords1 = ['hotels', 'lisbon', 'center'];
      const keywords2 = ['hotels', 'lisbon', 'airport'];

      const similarity = keywordService.calculateSimilarity(keywords1, keywords2);

      // Intersection: {hotels, lisbon} = 2
      // Union: {hotels, lisbon, center, airport} = 4
      // Similarity: 2/4 = 0.5
      expect(similarity).toBe(0.5);
    });

    it('should normalize keywords', () => {
      const keyword = 'LiSbOn';
      const normalized = keywordService.normalizeKeyword(keyword);

      expect(normalized).toBe('lisbon');
    });

    it('should remove accents when normalizing', () => {
      const keyword = 'José';
      const normalized = keywordService.normalizeKeyword(keyword);

      expect(normalized).toBe('jose');
    });
  });

  describe('LFUManager', () => {
    it('should register a cache entry with keywords', async () => {
      const cacheKey = 'search:hotels+lisbon:1:10';
      const keywords = ['hotels', 'lisbon'];
      const dataSize = 1024;

      await lfuManager.registerCacheEntry(cacheKey, keywords, dataSize);

      const info = await lfuManager.getCacheInfo();
      expect(info.totalEntries).toBe(1);
    });

    it('should increment keyword frequency on access', async () => {
      const cacheKey = 'search:hotels+lisbon:1:10';
      const keywords = ['hotels', 'lisbon'];

      await lfuManager.registerCacheEntry(cacheKey, keywords, 1024);
      await lfuManager.recordAccess(cacheKey);
      await lfuManager.recordAccess(cacheKey);

      const stats = await lfuManager.getKeywordStats(10);
      const hotelsStat = stats.find(s => s.keyword === 'hotels');

      // Initial registration = 1, two accesses = +2 = 3 total
      expect(hotelsStat?.frequency).toBe(3);
    });

    it('should find entries for eviction based on LFU', async () => {
      // Create multiple entries with different access patterns
      const entries = [
        { key: 'search:popular:1:10', keywords: ['popular'], accesses: 10 },
        { key: 'search:medium:1:10', keywords: ['medium'], accesses: 5 },
        { key: 'search:rare:1:10', keywords: ['rare'], accesses: 1 },
      ];

      for (const entry of entries) {
        await lfuManager.registerCacheEntry(entry.key, entry.keywords, 1024);
        
        // Simulate accesses
        for (let i = 1; i < entry.accesses; i++) {
          await lfuManager.recordAccess(entry.key);
        }
      }

      const candidates = await lfuManager.findEntriesForEviction(1);

      // The entry with least accesses should be the candidate
      expect(candidates[0].key).toBe('search:rare:1:10');
    });

    it('should evict entries when requested', async () => {
      const cacheKey = 'search:to+evict:1:10';
      const keywords = ['evict'];

      await lfuManager.registerCacheEntry(cacheKey, keywords, 1024);

      let info = await lfuManager.getCacheInfo();
      expect(info.totalEntries).toBe(1);

      const candidates = await lfuManager.findEntriesForEviction(1);
      await lfuManager.evict(candidates);

      info = await lfuManager.getCacheInfo();
      expect(info.totalEntries).toBe(0);
    });

    it('should get keyword statistics', async () => {
      await lfuManager.registerCacheEntry('search:hotels+lisbon:1:10', ['hotels', 'lisbon'], 1024);
      await lfuManager.registerCacheEntry('search:restaurants+lisbon:1:10', ['restaurants', 'lisbon'], 1024);

      const stats = await lfuManager.getKeywordStats(10);

      const lisbonStat = stats.find(s => s.keyword === 'lisbon');
      expect(lisbonStat?.cacheEntries).toBe(2);
      expect(lisbonStat?.frequency).toBe(2);
    });

    it('should provide cache info', async () => {
      await lfuManager.registerCacheEntry('search:test1:1:10', ['test'], 1024);
      await lfuManager.registerCacheEntry('search:test2:1:10', ['test'], 1024);

      const info = await lfuManager.getCacheInfo();

      expect(info.totalEntries).toBe(2);
      expect(info.maxEntries).toBe(100); // from ConfigService mock
      expect(info.utilizationPercentage).toBe(2);
      expect(info.topKeywords).toContain('test');
    });
  });

  describe('CacheService Integration', () => {
    it('should store and retrieve cache with keywords', async () => {
      const query = 'hotels in lisbon';
      const page = 1;
      const size = 10;
      const data = {
        items: [{ id: 1, name: 'Hotel A' }],
        total: 1,
        page: 1,
        size: 10,
      };

      await cacheService.set(query, page, size, data);
      const cached = await cacheService.get(query, page, size);

      expect(cached).toBeDefined();
      expect(cached?.items).toHaveLength(1);
    });

    it('should increment frequency on cache hit', async () => {
      const query = 'popular search';
      const data = { items: [], total: 0, page: 1, size: 10 };

      await cacheService.set(query, 1, 10, data);
      
      // Access multiple times
      await cacheService.get(query, 1, 10);
      await cacheService.get(query, 1, 10);
      await cacheService.get(query, 1, 10);

      const stats = await cacheService.getKeywordStatistics(10);
      const popularStat = stats.find(s => s.keyword === 'popular');

      // 1 initial + 3 accesses = 4
      expect(popularStat?.frequency).toBe(4);
    });

    it('should auto-evict when limit is reached', async () => {
      // Set a lower limit for testing
      const originalMax = 100;
      
      // Create entries up to the limit
      for (let i = 0; i < originalMax + 10; i++) {
        await cacheService.set(
          `query ${i}`,
          1,
          10,
          { items: [], total: 0, page: 1, size: 10 }
        );
      }

      const info = await cacheService.getCacheInfo();
      
      // Should have evicted some entries
      expect(info.totalEntries).toBeLessThanOrEqual(originalMax);
    });

    it('should get keyword statistics', async () => {
      await cacheService.set('hotels lisbon', 1, 10, { items: [], total: 0, page: 1, size: 10 });
      await cacheService.set('restaurants lisbon', 1, 10, { items: [], total: 0, page: 1, size: 10 });

      const stats = await cacheService.getKeywordStatistics(10);

      expect(stats.length).toBeGreaterThan(0);
      
      const lisbonStat = stats.find(s => s.keyword === 'lisbon');
      expect(lisbonStat).toBeDefined();
      expect(lisbonStat?.cacheEntries).toBe(2);
    });

    it('should perform manual eviction', async () => {
      // Create some entries
      for (let i = 0; i < 5; i++) {
        await cacheService.set(
          `query ${i}`,
          1,
          10,
          { items: [], total: 0, page: 1, size: 10 }
        );
      }

      const result = await cacheService.manualEviction(2);

      expect(result.evicted).toBe(2);
      expect(result.candidates).toHaveLength(2);
    });

    it('should clear all cache and LFU structures', async () => {
      await cacheService.set('test', 1, 10, { items: [], total: 0, page: 1, size: 10 });
      
      let info = await cacheService.getCacheInfo();
      expect(info.totalEntries).toBeGreaterThan(0);

      await cacheService.invalidate();

      info = await cacheService.getCacheInfo();
      expect(info.totalEntries).toBe(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should prioritize frequently accessed queries', async () => {
      const popularQuery = 'hotels lisbon';
      const rareQuery = 'obscure search term xyz';

      // Create both entries
      await cacheService.set(popularQuery, 1, 10, { items: [], total: 0, page: 1, size: 10 });
      await cacheService.set(rareQuery, 1, 10, { items: [], total: 0, page: 1, size: 10 });

      // Access popular query multiple times
      for (let i = 0; i < 10; i++) {
        await cacheService.get(popularQuery, 1, 10);
      }

      // Find eviction candidates
      const candidates = await lfuManager.findEntriesForEviction(1);

      // Rare query should be the candidate
      expect(candidates[0].key).toContain('obscure');
    });

    it('should handle similar queries intelligently', async () => {
      // Similar queries share keywords
      await cacheService.set('best hotels lisbon', 1, 10, { items: [], total: 0, page: 1, size: 10 });
      await cacheService.set('best restaurants lisbon', 1, 10, { items: [], total: 0, page: 1, size: 10 });
      await cacheService.set('best attractions lisbon', 1, 10, { items: [], total: 0, page: 1, size: 10 });

      const stats = await cacheService.getKeywordStatistics(10);
      
      const bestStat = stats.find(s => s.keyword === 'best');
      const lisbonStat = stats.find(s => s.keyword === 'lisbon');

      // Both keywords should appear in 3 entries
      expect(bestStat?.cacheEntries).toBe(3);
      expect(lisbonStat?.cacheEntries).toBe(3);
    });
  });
});
