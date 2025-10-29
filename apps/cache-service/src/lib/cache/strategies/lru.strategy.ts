import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheAdapter } from '../adapter';
import { KeywordService } from '../keyword.service';
import { EvictionStrategy } from '../eviction-strategy.interface';
import {
  CacheEntryMetadata,
  LFUConfig,
  KeywordStats,
  EvictionCandidate
} from '../types';

/**
 * Implementação da estratégia LRU (Least Recently Used)
 * Remove entries com acesso mais antigo (ignora frequência)
 */
@Injectable()
export class LRUStrategy extends EvictionStrategy {
  private readonly logger = new Logger(LRUStrategy.name);
  private readonly config: LFUConfig;

  // Prefixos para chaves Redis
  private readonly KEYWORD_FREQ_PREFIX = 'keyword:freq:';
  private readonly KEYWORD_KEYS_PREFIX = 'keyword:keys:';
  private readonly CACHE_META_PREFIX = 'cache:meta:';
  private readonly KEYWORD_RANKING_KEY = 'keywords:ranking';
  private readonly CACHE_ENTRIES_SET = 'cache:entries';

  constructor(
    private readonly cacheAdapter: CacheAdapter,
    private readonly keywordService: KeywordService,
    private readonly configService: ConfigService
  ) {
    super();
    this.config = {
      maxEntries: this.configService.get<number>('EVICTION_MAX_ENTRIES', 1000),
      evictionBatchSize: this.configService.get<number>('EVICTION_BATCH_SIZE', 50),
      keywordMinLength: 3,
      stopWords: []
    };

    this.logger.log(`LRU Strategy initialized with max entries: ${this.config.maxEntries}`);
  }

  getStrategyName(): string {
    return 'LRU';
  }

  /**
   * Incrementa frequência das keywords no sorted set (mantido para compatibilidade)
   */
  private async incrementKeywordFrequency(keywords: string[]): Promise<void> {
    try {
      for (const keyword of keywords) {
        const normalized = this.keywordService.normalizeKeyword(keyword);

        const freqKey = `${this.KEYWORD_FREQ_PREFIX}${normalized}`;
        const currentFreq = await this.cacheAdapter.get(freqKey);
        const newFreq = (parseInt(currentFreq || '0', 10) + 1).toString();
        await this.cacheAdapter.set(freqKey, newFreq);

        await this.cacheAdapter.zincrby(
          this.KEYWORD_RANKING_KEY,
          1,
          normalized
        );
      }
    } catch (error) {
      this.logger.error(`Error incrementing keyword frequency: ${error}`);
    }
  }

  /**
   * Decrementa frequência das keywords
   */
  private async decrementKeywordFrequency(keywords: string[]): Promise<void> {
    try {
      for (const keyword of keywords) {
        const normalized = this.keywordService.normalizeKeyword(keyword);

        const freqKey = `${this.KEYWORD_FREQ_PREFIX}${normalized}`;
        const currentFreq = await this.cacheAdapter.get(freqKey);
        const newFreq = Math.max(0, parseInt(currentFreq || '0', 10) - 1).toString();

        if (parseInt(newFreq, 10) === 0) {
          await this.cacheAdapter.del(freqKey);
        } else {
          await this.cacheAdapter.set(freqKey, newFreq);
        }

        await this.cacheAdapter.zincrby(
          this.KEYWORD_RANKING_KEY,
          -1,
          normalized
        );
      }
    } catch (error) {
      this.logger.error(`Error decrementing keyword frequency: ${error}`);
    }
  }

  async registerCacheEntry(
    cacheKey: string,
    keywords: string[],
    dataSize: number
  ): Promise<void> {
    try {
      const metadata: CacheEntryMetadata = {
        key: cacheKey,
        keywords,
        frequency: 1, // Mantido para compatibilidade, mas não usado em LRU
        lastAccess: Date.now(),
        created: Date.now(),
        size: dataSize
      };

      const metaKey = `${this.CACHE_META_PREFIX}${cacheKey}`;
      await this.cacheAdapter.set(metaKey, JSON.stringify(metadata));

      await this.cacheAdapter.sadd(this.CACHE_ENTRIES_SET, cacheKey);

      // Associa keywords ao cache entry
      for (const keyword of keywords) {
        const normalized = this.keywordService.normalizeKeyword(keyword);
        const keywordKeysKey = `${this.KEYWORD_KEYS_PREFIX}${normalized}`;
        await this.cacheAdapter.sadd(keywordKeysKey, cacheKey);
      }

      await this.incrementKeywordFrequency(keywords);

      this.logger.debug(`Registered cache entry: ${cacheKey} with ${keywords.length} keywords`);
    } catch (error) {
      this.logger.error(`Error registering cache entry: ${error}`);
    }
  }

  async recordAccess(cacheKey: string): Promise<void> {
    try {
      const metaKey = `${this.CACHE_META_PREFIX}${cacheKey}`;
      const metaStr = await this.cacheAdapter.get(metaKey);

      if (metaStr) {
        const metadata: CacheEntryMetadata = JSON.parse(metaStr);
        // Em LRU, só atualizamos lastAccess (não incrementamos frequency)
        metadata.lastAccess = Date.now();

        await this.cacheAdapter.set(metaKey, JSON.stringify(metadata));
        await this.incrementKeywordFrequency(metadata.keywords);

        this.logger.debug(`Recorded access for: ${cacheKey} (lastAccess: ${metadata.lastAccess})`);
      }
    } catch (error) {
      this.logger.error(`Error recording access: ${error}`);
    }
  }

  private async countCacheEntries(): Promise<number> {
    try {
      const entries = await this.cacheAdapter.smembers(this.CACHE_ENTRIES_SET);
      return entries.length;
    } catch (error) {
      this.logger.error(`Error counting cache entries: ${error}`);
      return 0;
    }
  }

  async findEntriesForEviction(count: number): Promise<EvictionCandidate[]> {
    try {
      const candidates: EvictionCandidate[] = [];
      const entries = await this.cacheAdapter.smembers(this.CACHE_ENTRIES_SET);

      // Busca metadados de todas as entradas
      for (const entry of entries) {
        const metaKey = `${this.CACHE_META_PREFIX}${entry}`;
        const metaStr = await this.cacheAdapter.get(metaKey);

        if (metaStr) {
          const metadata: CacheEntryMetadata = JSON.parse(metaStr);

          // LRU: score baseado APENAS no tempo desde último acesso
          // Quanto maior o tempo sem acesso, maior o score (pior)
          const timeSinceAccess = Date.now() - metadata.lastAccess;
          const score = timeSinceAccess; // Milissegundos desde último acesso

          candidates.push({
            key: metadata.key,
            frequency: metadata.frequency,
            score,
            keywords: metadata.keywords
          });
        }
      }

      // Ordena por score (maior score = mais tempo sem acesso = remover primeiro)
      candidates.sort((a, b) => b.score - a.score);

      const selected = candidates.slice(0, count);
      this.logger.log(`Found ${selected.length} LRU candidates for eviction out of ${candidates.length} total entries`);

      return selected;
    } catch (error) {
      this.logger.error(`Error finding entries for eviction: ${error}`);
      return [];
    }
  }

  async evictEntry(cacheKey: string): Promise<void> {
    try {
      const metaKey = `${this.CACHE_META_PREFIX}${cacheKey}`;
      const metaStr = await this.cacheAdapter.get(metaKey);

      if (metaStr) {
        const metadata: CacheEntryMetadata = JSON.parse(metaStr);

        // Remove associações keyword -> key
        for (const keyword of metadata.keywords) {
          const normalized = this.keywordService.normalizeKeyword(keyword);
          const keywordKeysKey = `${this.KEYWORD_KEYS_PREFIX}${normalized}`;
          await this.cacheAdapter.srem(keywordKeysKey, cacheKey);
        }

        await this.decrementKeywordFrequency(metadata.keywords);
        await this.cacheAdapter.del(metaKey);
      }

      await this.cacheAdapter.srem(this.CACHE_ENTRIES_SET, cacheKey);
      await this.cacheAdapter.del(cacheKey);

      this.logger.debug(`Evicted cache entry: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Error evicting entry ${cacheKey}: ${error}`);
    }
  }

  async evict(candidates: EvictionCandidate[]): Promise<void> {
    this.logger.log(`Evicting ${candidates.length} cache entries (LRU)`);

    for (const candidate of candidates) {
      await this.evictEntry(candidate.key);
    }

    this.logger.log(`Eviction completed. Removed ${candidates.length} entries.`);
  }

  async checkAndEvict(): Promise<boolean> {
    try {
      const currentCount = await this.countCacheEntries();

      if (currentCount > this.config.maxEntries) {
        const excessCount = currentCount - this.config.maxEntries;
        const evictionCount = Math.min(
          excessCount + this.config.evictionBatchSize,
          this.config.evictionBatchSize
        );

        this.logger.warn(
          `Cache limit exceeded: ${currentCount}/${this.config.maxEntries}. ` +
          `Evicting ${evictionCount} entries (LRU)...`
        );

        const candidates = await this.findEntriesForEviction(evictionCount);
        await this.evict(candidates);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error in checkAndEvict: ${error}`);
      return false;
    }
  }

  async getKeywordStats(limit: number = 50): Promise<KeywordStats[]> {
    try {
      const stats: KeywordStats[] = [];

      const topKeywords = await this.cacheAdapter.zrevrange(
        this.KEYWORD_RANKING_KEY,
        0,
        limit - 1
      );

      for (const keyword of topKeywords) {
        const freqKey = `${this.KEYWORD_FREQ_PREFIX}${keyword}`;
        const frequency = parseInt(await this.cacheAdapter.get(freqKey) || '0', 10);

        const keywordKeysKey = `${this.KEYWORD_KEYS_PREFIX}${keyword}`;
        const cacheEntries = await this.cacheAdapter.smembers(keywordKeysKey);

        let lastAccess = 0;
        for (const entry of cacheEntries) {
          const metaKey = `${this.CACHE_META_PREFIX}${entry}`;
          const metaStr = await this.cacheAdapter.get(metaKey);
          if (metaStr) {
            const metadata: CacheEntryMetadata = JSON.parse(metaStr);
            lastAccess = Math.max(lastAccess, metadata.lastAccess);
          }
        }

        stats.push({
          keyword,
          frequency,
          cacheEntries: cacheEntries.length,
          lastAccess
        });
      }

      return stats;
    } catch (error) {
      this.logger.error(`Error getting keyword stats: ${error}`);
      return [];
    }
  }

  async clearAll(): Promise<void> {
    try {
      this.logger.warn('Clearing all LRU structures...');

      const entries = await this.cacheAdapter.smembers(this.CACHE_ENTRIES_SET);

      for (const entry of entries) {
        await this.evictEntry(entry);
      }

      await this.cacheAdapter.del(this.KEYWORD_RANKING_KEY);

      this.logger.log('LRU structures cleared');
    } catch (error) {
      this.logger.error(`Error clearing LRU structures: ${error}`);
    }
  }

  async getCacheInfo(): Promise<{
    totalEntries: number;
    maxEntries: number;
    utilizationPercentage: number;
    topKeywords: string[];
    strategyName: string;
  }> {
    try {
      const totalEntries = await this.countCacheEntries();
      const topKeywords = await this.cacheAdapter.zrevrange(
        this.KEYWORD_RANKING_KEY,
        0,
        9
      );

      return {
        totalEntries,
        maxEntries: this.config.maxEntries,
        utilizationPercentage: (totalEntries / this.config.maxEntries) * 100,
        topKeywords,
        strategyName: this.getStrategyName()
      };
    } catch (error) {
      this.logger.error(`Error getting cache info: ${error}`);
      return {
        totalEntries: 0,
        maxEntries: this.config.maxEntries,
        utilizationPercentage: 0,
        topKeywords: [],
        strategyName: this.getStrategyName()
      };
    }
  }
}
