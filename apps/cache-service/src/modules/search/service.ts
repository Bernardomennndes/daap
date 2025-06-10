import { Injectable, OnModuleInit } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { CacheService } from "../cache/service";
import { SearchResult } from "../../lib/cache/types";
import { SecretsService } from "../../lib/modules/global/secrets/service";

@Injectable()
export class SearchService implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
    private readonly secretsService: SecretsService
  ) {
    console.log("SearchService: constructor called");
    console.log("SearchService: httpService is:", httpService);
    console.log("SearchService: cacheService is:", cacheService);
    console.log("SearchService: secretsService is:", secretsService);
  }

  onModuleInit() {
    console.log('SearchService: onModuleInit called');
    console.log('SearchService: All dependencies initialized successfully');
  }

  async search(
    query: string,
    page: number = 1,
    size: number = 10
  ): Promise<SearchResult> {
    console.log(
      `SearchService: searching for query="${query}", page=${page}, size=${size}`
    );

    // Primeiro, verifica se existe no cache
    try {
      console.log("SearchService: checking cache...");
      const cached = await this.cacheService.get(query, page, size);
      if (cached) {
        console.log("SearchService: found in cache");
        return {
          ...cached,
          source: "cache",
        } as SearchResult;
      }
      console.log(
        "SearchService: not found in cache, fetching from search-service"
      );
    } catch (cacheError) {
      console.error("SearchService: Cache error:", cacheError);
    }

    // Se não existe no cache, faz a requisição para o search-service
    try {
      console.log(
        `SearchService: calling search-service at ${this.secretsService.SEARCH_SERVICE_URL}/search`
      );
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.secretsService.SEARCH_SERVICE_URL}/search`,
          {
            params: { q: query, page, size },
          }
        )
      );

      const searchResult: SearchResult = {
        ...response.data,
        page,
        size,
        source: "search-service",
      };

      // Armazena no cache para próximas consultas
      try {
        console.log("SearchService: saving to cache...");
        await this.cacheService.set(
          query,
          page,
          size,
          searchResult,
          this.secretsService.CACHE_TTL
        );
        console.log("SearchService: saved to cache successfully");
      } catch (cacheError) {
        console.error("SearchService: Error saving to cache:", cacheError);
      }

      return searchResult;
    } catch (error) {
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

  async invalidateCache(query?: string): Promise<void> {
    await this.cacheService.invalidate(query);
  }
}
