import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface SearchResult {
  items: any[];
  total: number;
  page: number;
  size: number;
  source?: string;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async search(query: string, page: number = 1, size: number = 10): Promise<SearchResult> {
    console.log(`[Reviews Service] Received search request: q="${query}", page=${page}, size=${size}`);

    try {
      const cacheServiceUrl = this.configService.get('CACHE_SERVICE_URL', 'http://localhost:3002');
      console.log(`[Reviews Service] Calling Cache Service: ${cacheServiceUrl}/cache/search`);

      const response = await firstValueFrom(
        this.httpService.get(`${cacheServiceUrl}/cache/search`, {
          params: { q: query, page, size },
          timeout: 60000
        })
      );

      console.log(`[Reviews Service] Cache Service responded with source: ${response.data.source}`);
      return response.data;
    } catch (error) {
      console.warn('Cache service failed, falling back to search service directly:', error.message);
      
      // Fallback to search service directly
      try {
        const searchServiceUrl = this.configService.get('SEARCH_SERVICE_URL', 'http://search-service:3003');
        const response = await firstValueFrom(
          this.httpService.get(`${searchServiceUrl}/search`, {
            params: { q: query, page, size },
            timeout: 60000
          })
        );

        return {
          ...response.data,
          source: 'search-direct'
        };
      } catch (searchError) {
        throw new Error(`Both cache and search services failed: ${searchError instanceof Error ? searchError.message : 'Unknown error'}`);
      }
    }
  }

  async invalidateCache(query?: string): Promise<void> {
    try {
      const cacheServiceUrl = this.configService.get('CACHE_SERVICE_URL', 'http://localhost:3002');
      await firstValueFrom(
        this.httpService.delete(`${cacheServiceUrl}/cache/invalidate`, {
          params: query ? { q: query } : {}
        })
      );
    } catch (error) {
      // Log error but don't throw - cache invalidation failure shouldn't break the flow
      console.error('Failed to invalidate cache:', error);
    }
  }
}
