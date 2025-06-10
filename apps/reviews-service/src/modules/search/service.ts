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
    try {
      const cacheServiceUrl = this.configService.get('CACHE_SERVICE_URL', 'http://localhost:3002');
      const response = await firstValueFrom(
        this.httpService.get(`${cacheServiceUrl}/search`, {
          params: { q: query, page, size }
        })
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
