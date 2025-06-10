import { Injectable, OnModuleInit } from '@nestjs/common';
import { CacheAdapter } from '../../lib/cache/adapter';
import { SearchResult, CacheEntry } from '../../lib/cache/types';

@Injectable()
export class CacheService implements OnModuleInit {
  constructor(private readonly cacheAdapter: CacheAdapter) {
    console.log('CacheService: constructor called');
    console.log('CacheService: cacheAdapter is:', cacheAdapter);
  }

  onModuleInit() {
    console.log('CacheService: onModuleInit called');
    console.log('CacheService: cacheAdapter is working:', !!this.cacheAdapter);
  }

  private generateCacheKey(query: string, page: number, size: number): string {
    return `search:${query}:${page}:${size}`;
  }

  async get(query: string, page: number, size: number): Promise<SearchResult | null> {
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
    ttl: number = 3600
  ): Promise<void> {
    const key = this.generateCacheKey(query, page, size);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    await this.cacheAdapter.set(key, JSON.stringify(entry), ttl);
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
    }
  }

  async exists(query: string, page: number, size: number): Promise<boolean> {
    const key = this.generateCacheKey(query, page, size);
    return await this.cacheAdapter.exists(key);
  }
}
