import {
  Controller,
  Get,
  Query,
  Delete,
  Post,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { CacheService } from "./service";
import { getTracingService } from '@daap/telemetry';

@Controller("cache")
export class CacheController {
  private readonly tracing = getTracingService('cache-service');

  constructor(
    private readonly cacheService: CacheService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  @Get("search")
  async getCachedSearch(
    @Query("q") query: string,
    @Query("page") page: string = "1",
    @Query("size") size: string = "10"
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;

    // Try to get from cache
    const cached = await this.cacheService.get(query, pageNum, sizeNum);

    if (cached) {
      return {
        ...cached,
        source: "cache",
      };
    }

    // Cache miss - delegate to Search Service
    return this.tracing.startActiveSpan(
      'http.client.search_service',
      async (span) => {
        span.setAttributes({
          'http.method': 'GET',
          'http.target': '/search',
          'peer.service': 'search-service',
          'search.query': query,
        });

        try {
          const searchServiceUrl = this.configService.get('SEARCH_SERVICE_URL', 'http://search-service:3003');
          const response = await firstValueFrom(
            this.httpService.get(`${searchServiceUrl}/search`, {
              params: { q: query, page: pageNum, size: sizeNum },
              timeout: 60000,
            })
          );

          const searchResult = {
            ...response.data,
            page: pageNum,
            size: sizeNum,
            source: "search",
          };

          // Save to cache for future requests
          try {
            await this.cacheService.set(
              query,
              pageNum,
              sizeNum,
              searchResult,
              parseInt(this.configService.get('CACHE_TTL', '345600'), 10) // 4 days default
            );
          } catch (cacheError) {
            console.error("Failed to save to cache:", cacheError);
          }

          return searchResult;
        } catch (error) {
          span.setAttributes({
            'http.status_code': (error as any).response?.status || 500,
          });
          throw error;
        }
      }
    );
  }

  @Get("exists")
  async checkCacheExists(
    @Query("q") query: string,
    @Query("page") page: string = "1",
    @Query("size") size: string = "10"
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;

    const exists = await this.cacheService.exists(query, pageNum, sizeNum);

    return { exists };
  }

  @Delete("invalidate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async invalidateCache(@Query("q") query?: string) {
    await this.cacheService.invalidate(query);
  }

  // Novos endpoints para LFU

  @Get("stats/keywords")
  async getKeywordStatistics(@Query("limit") limit: string = "50") {
    const limitNum = parseInt(limit, 10) || 50;
    const stats = await this.cacheService.getKeywordStatistics(limitNum);
    
    return {
      total: stats.length,
      keywords: stats
    };
  }

  @Get("stats/info")
  async getCacheInfo() {
    return await this.cacheService.getCacheInfo();
  }

  @Post("evict")
  @HttpCode(HttpStatus.OK)
  async manualEviction(@Query("count") count: string = "10") {
    const countNum = parseInt(count, 10) || 10;
    return await this.cacheService.manualEviction(countNum);
  }

  @Get("metrics/hit-types")
  async getCacheMetrics() {
    return await this.cacheService.getCacheMetrics();
  }
}
