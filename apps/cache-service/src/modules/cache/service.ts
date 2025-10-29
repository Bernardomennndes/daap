import { Injectable, OnModuleInit } from "@nestjs/common";
import { CacheAdapter } from "../../lib/cache/adapter";
import { SearchResult, CacheEntry } from "../../lib/cache/types";
import { KeywordService } from "../../lib/cache/keyword.service";
import { EvictionStrategy } from "../../lib/cache/eviction-strategy.interface";

@Injectable()
export class CacheService implements OnModuleInit {
  constructor(
    private readonly cacheAdapter: CacheAdapter,
    private readonly keywordService: KeywordService,
    private readonly evictionStrategy: EvictionStrategy
  ) {}

  onModuleInit() {}

  private generateCacheKey(query: string, page: number, size: number): string {
    return `search:${query}:${page}:${size}`;
  }

  async get(
    query: string,
    page: number,
    size: number
  ): Promise<SearchResult | null> {
    const key = this.generateCacheKey(query, page, size);
    const cached = await this.cacheAdapter.get(key);

    if (!cached) {
      return null;
    }

    try {
      const entry: CacheEntry = JSON.parse(cached);

      // Verifica se o cache não expirou
      if (Date.now() - entry.timestamp > entry.ttl * 1000) {
        await this.cacheAdapter.del(key);
        return null;
      }

      // Registra acesso para estratégia de eviction
      await this.evictionStrategy.recordAccess(key);

      return entry.data;
    } catch (error) {
      // Se houver erro ao parsear, remove o cache corrompido
      await this.cacheAdapter.del(key);
      return null;
    }
  }

  async set(
    query: string,
    page: number,
    size: number,
    data: SearchResult,
    ttl: number = 4 * 24 * 60 * 60 // 4 dias
  ): Promise<void> {
    const key = this.generateCacheKey(query, page, size);
    
    // Extrai keywords da query
    const keywords = this.keywordService.extractKeywords(query);
    
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl,
      keywords,
      frequency: 1
    };

    const entryStr = JSON.stringify(entry);
    await this.cacheAdapter.set(key, entryStr, ttl);

    // Registra na estratégia de eviction
    await this.evictionStrategy.registerCacheEntry(
      key,
      keywords,
      entryStr.length
    );

    // Verifica se precisa fazer eviction
    await this.evictionStrategy.checkAndEvict();
  }

  async invalidate(query?: string): Promise<void> {
    if (query) {
      // Remove apenas caches relacionados à query específica
      // Implementação simplificada - em produção, usar padrões de chave
      const key = this.generateCacheKey(query, 1, 10);
      await this.cacheAdapter.del(key);
    } else {
      // Remove todo o cache
      await this.cacheAdapter.flush();
      // Limpa estruturas da estratégia de eviction
      await this.evictionStrategy.clearAll();
    }
  }

  async exists(query: string, page: number, size: number): Promise<boolean> {
    const key = this.generateCacheKey(query, page, size);
    return await this.cacheAdapter.exists(key);
  }

  // Métodos para estatísticas e gerenciamento de eviction
  async getKeywordStatistics(limit: number = 50) {
    return await this.evictionStrategy.getKeywordStats(limit);
  }

  async getCacheInfo() {
    return await this.evictionStrategy.getCacheInfo();
  }

  async manualEviction(count: number) {
    const candidates = await this.evictionStrategy.findEntriesForEviction(count);
    await this.evictionStrategy.evict(candidates);
    return {
      evicted: candidates.length,
      candidates: candidates.map(c => ({
        key: c.key,
        frequency: c.frequency,
        score: c.score
      }))
    };
  }
}
