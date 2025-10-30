import { Injectable, OnModuleInit } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { CacheService } from "../cache/service";
import { SearchResult } from "../../lib/cache/types";
import { SecretsService } from "../../lib/modules/global/secrets/service";
import { getTracingService } from '@daap/telemetry';

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly tracing = getTracingService('cache-service');

  constructor(
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
    private readonly secretsService: SecretsService
  ) {}

  onModuleInit() {}

  async search(
    query: string,
    page: number = 1,
    size: number = 10
  ): Promise<SearchResult> {
    // Primeiro, verifica se existe no cache
    try {
      const cached = await this.cacheService.get(query, page, size);
      if (cached) {
        return {
          ...cached,
          source: "cache",
        } as SearchResult;
      }
    } catch (cacheError) {
      console.error("SearchService: Cache error:", cacheError);
    }

    // Se não existe no cache, faz a requisição para o search-service
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
          console.log(`Making request to search service: ${this.secretsService.SEARCH_SERVICE_URL}/search`);

          const response = await firstValueFrom(
            this.httpService.get(
              `${this.secretsService.SEARCH_SERVICE_URL}/search`,
              {
                params: { q: query, page, size },
                timeout: 60000,
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              }
            ).pipe()
          );

          span.setAttributes({
            'http.status_code': 200,
            'search.results.total': response.data.total || 0,
          });

          const searchResult: SearchResult = {
            ...response.data,
            page,
            size,
            source: "search",
          };

          // Armazena no cache para próximas consultas
          try {
            await this.cacheService.set(
              query,
              page,
              size,
              searchResult,
              this.secretsService.CACHE_TTL
            );
          } catch (cacheError) {
            console.error("SearchService: Error saving to cache:", cacheError);
          }

          return searchResult;
        } catch (error) {
          span.setAttributes({
            'http.status_code': (error as any).response?.status || 500,
          });
          console.error("SearchService: Error calling search-service:", error);
          if (error instanceof Error) {
            throw new Error(
              `Failed to fetch from search service: ${error.message}`
            );
          } else {
            throw new Error("Failed to fetch from search service: Unknown error");
          }
        }
      }
    );
  }

  async invalidateCache(query?: string): Promise<void> {
    await this.cacheService.invalidate(query);
  }
}
