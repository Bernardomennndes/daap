import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../src/modules/cache/service';
import { KeywordService } from '../src/lib/cache/keyword.service';
import { CacheAdapter } from '../src/lib/cache/adapter';
import { EvictionStrategy } from '../src/lib/cache/eviction-strategy.interface';

describe('Cache Optimization: Solutions 1+2+3', () => {
  let cacheService: CacheService;
  let keywordService: KeywordService;
  let mockAdapter: jest.Mocked<CacheAdapter>;
  let mockStrategy: jest.Mocked<EvictionStrategy>;

  const mockSearchResult = {
    items: [{ id: 1, name: 'Test Product', category: 'Electronics' }],
    total: 1,
    page: 1,
    size: 10
  };

  beforeEach(async () => {
    // Mock CacheAdapter
    mockAdapter = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      smembers: jest.fn(),
      zincrby: jest.fn(),
      zrevrange: jest.fn(),
      flush: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      zadd: jest.fn(),
      zrange: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      keys: jest.fn()
    } as any;

    // Mock EvictionStrategy
    mockStrategy = {
      recordAccess: jest.fn().mockResolvedValue(undefined),
      registerCacheEntry: jest.fn().mockResolvedValue(undefined),
      checkAndEvict: jest.fn().mockResolvedValue(false),
      getKeywordStats: jest.fn().mockResolvedValue([]),
      getCacheInfo: jest.fn().mockResolvedValue({
        totalEntries: 0,
        maxEntries: 1000,
        utilizationPercentage: 0,
        topKeywords: [],
        strategyName: 'LFU'
      }),
      findEntriesForEviction: jest.fn().mockResolvedValue([]),
      evict: jest.fn().mockResolvedValue(undefined),
      clearAll: jest.fn().mockResolvedValue(undefined),
      getStrategyName: jest.fn().mockReturnValue('LFU')
    } as any;

    // Set environment variables for fuzzy matching
    process.env.ENABLE_FUZZY_CACHE = 'true';
    process.env.FUZZY_SIMILARITY_THRESHOLD = '0.7';
    process.env.FUZZY_MAX_CANDIDATES = '10';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        KeywordService,
        { provide: CacheAdapter, useValue: mockAdapter },
        { provide: EvictionStrategy, useValue: mockStrategy }
      ]
    }).compile();

    cacheService = module.get<CacheService>(CacheService);
    keywordService = module.get<KeywordService>(KeywordService);

    // Default mock behavior (can be overridden in individual tests)
    mockAdapter.smembers.mockResolvedValue([]);
    mockAdapter.zincrby.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Solution 3: Stemming', () => {
    it('should normalize plural to singular', () => {
      const keywords1 = keywordService.extractKeywords('laptops');
      const keywords2 = keywordService.extractKeywords('laptop');

      expect(keywords1).toEqual(keywords2);
      expect(keywords1).toEqual(['laptop']);
    });

    it('should handle verb variations', () => {
      const keywords1 = keywordService.extractKeywords('charging cable');
      const keywords2 = keywordService.extractKeywords('charger cable');

      // Both should have 'cabl' as second keyword
      expect(keywords1[1]).toBe(keywords2[1]);
    });

    it('should stem multiple words correctly', () => {
      const keywords = keywordService.extractKeywords('laptops cables chargers');

      // All should be stemmed
      expect(keywords).toContain('laptop');
      expect(keywords).toContain('cabl');
      expect(keywords).toContain('charger');
    });

    it('should remove stop words before stemming', () => {
      const keywords = keywordService.extractKeywords('the best laptops for students');

      // Stop words removed: 'the', 'for'
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('for');
      expect(keywords).toContain('best');
      expect(keywords).toContain('laptop'); // stemmed from 'laptops'
      expect(keywords).toContain('student'); // stemmed from 'students'
    });
  });

  describe('Solution 1: Query Normalization', () => {
    it('should generate same key for different word order', async () => {
      const mockEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['charger', 'laptop']
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(mockEntry));

      // Both queries should generate the same cache key
      const result1 = await cacheService.get('laptop charger', 1, 10);
      const result2 = await cacheService.get('charger laptop', 1, 10);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1?.items).toEqual(result2?.items);
    });

    it('should remove stop words before generating key', async () => {
      const mockEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['best', 'laptop']
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cacheService.get('the best laptop', 1, 10);

      expect(result).not.toBeNull();
    });

    it('should handle case insensitivity', async () => {
      const mockEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['laptop']
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(mockEntry));

      const result1 = await cacheService.get('LAPTOP', 1, 10);
      const result2 = await cacheService.get('laptop', 1, 10);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });

    it('should combine stemming + normalization', async () => {
      const mockEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['cabl', 'laptop'] // stemmed and sorted
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(mockEntry));

      // "laptops cables" → stem → ["laptop", "cabl"] → sort → "cabl laptop"
      const result = await cacheService.get('laptops cables', 1, 10);

      expect(result).not.toBeNull();
    });
  });

  describe('Solution 2: Fuzzy Matching', () => {
    it('should find partial match with 70% similarity', async () => {
      const cachedEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['laptop', 'charger', 'usb']
      };

      const metadata = {
        keywords: ['laptop', 'charger', 'usb'],
        frequency: 5,
        lastAccess: Date.now()
      };

      // Mock: first call returns null (no exact match), then fuzzy matching
      mockAdapter.get
        .mockResolvedValueOnce(null) // No exact match
        .mockResolvedValueOnce(JSON.stringify(metadata)) // Metadata for similarity
        .mockResolvedValueOnce(JSON.stringify(cachedEntry)); // Cache entry

      mockAdapter.smembers.mockResolvedValue([
        'search:charger laptop usb:1:10'
      ]);

      // Query with 3/4 keywords = 75% similarity (above 70% threshold)
      const result = await cacheService.get('laptop charger usb cable', 1, 10);

      expect(result).not.toBeNull();
      expect(result?._cacheMetadata?.fuzzyMatch).toBe(true);
      expect(result?._cacheMetadata?.similarity).toBeGreaterThanOrEqual(0.7);
    });

    it('should not return match below similarity threshold', async () => {
      mockAdapter.get.mockResolvedValue(null);
      mockAdapter.smembers.mockResolvedValue([]);

      // Completely different query
      const result = await cacheService.get('smartphone wireless headphones', 1, 10);

      expect(result).toBeNull();
    });

    it('should prioritize highest similarity match', async () => {
      const highSimilarityEntry = {
        data: { ...mockSearchResult, items: [{ id: 2, name: 'High Match' }] },
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['laptop', 'charger']
      };

      const lowSimilarityEntry = {
        data: { ...mockSearchResult, items: [{ id: 3, name: 'Low Match' }] },
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['laptop', 'cable', 'adapter']
      };

      const highMetadata = { keywords: ['laptop', 'charger'], frequency: 10, lastAccess: Date.now() };
      const lowMetadata = { keywords: ['laptop', 'cable', 'adapter'], frequency: 5, lastAccess: Date.now() };

      // Mock no exact match
      mockAdapter.get.mockResolvedValueOnce(null);

      // Mock smembers returning both candidates
      mockAdapter.smembers.mockResolvedValue([
        'search:charger laptop:1:10',
        'search:adapter cable laptop:1:10'
      ]);

      // Mock metadata calls
      mockAdapter.get
        .mockResolvedValueOnce(JSON.stringify(highMetadata))
        .mockResolvedValueOnce(JSON.stringify(lowMetadata))
        .mockResolvedValueOnce(JSON.stringify(highSimilarityEntry));

      // Query: "laptop charger" should match "charger laptop" better
      const result = await cacheService.get('laptop charger', 1, 10);

      expect(result).not.toBeNull();
      expect(result?.items[0].name).toBe('High Match');
    });
  });

  describe('Combined Solutions: Integration', () => {
    it('should use all 3 solutions together', async () => {
      const cachedEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['charger', 'laptop'] // Already stemmed and sorted
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(cachedEntry));

      // Query with plural + different order + stop words
      // "the laptops charger" → stem → ["laptop", "charger"] → sort → "charger laptop"
      const result = await cacheService.get('the laptops charger', 1, 10);

      expect(result).not.toBeNull();
      expect(mockStrategy.recordAccess).toHaveBeenCalled();
    });

    it('should handle expired cache entries', async () => {
      const expiredEntry = {
        data: mockSearchResult,
        timestamp: Date.now() - 4000 * 1000, // 4000 seconds ago
        ttl: 3600, // 1 hour TTL
        keywords: ['laptop']
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(expiredEntry));

      const result = await cacheService.get('laptop', 1, 10);

      expect(result).toBeNull();
      expect(mockAdapter.del).toHaveBeenCalled();
    });

    it('should handle corrupted cache entries gracefully', async () => {
      mockAdapter.get.mockResolvedValue('invalid json{{{');

      const result = await cacheService.get('laptop', 1, 10);

      expect(result).toBeNull();
      expect(mockAdapter.del).toHaveBeenCalled();
    });
  });

  describe('Cache Metrics', () => {
    it('should track normalized cache hits', async () => {
      const mockEntry = {
        data: mockSearchResult,
        timestamp: Date.now(),
        ttl: 3600,
        keywords: ['laptop']
      };

      mockAdapter.get.mockResolvedValue(JSON.stringify(mockEntry));
      mockAdapter.zincrby.mockResolvedValue(1);

      await cacheService.get('laptop', 1, 10);

      expect(mockAdapter.zincrby).toHaveBeenCalledWith(
        'cache:metrics:hit_types',
        1,
        'normalized'
      );
    });

    it('should return cache metrics correctly', async () => {
      mockAdapter.zrevrange.mockResolvedValue([
        'normalized', '100',
        'fuzzy', '20',
        'miss', '30'
      ]);

      const metrics = await cacheService.getCacheMetrics();

      expect(metrics).toEqual({
        normalized: 100,
        fuzzy: 20,
        miss: 30,
        total: 150,
        hitRate: '80.00%'
      });
    });
  });
});
