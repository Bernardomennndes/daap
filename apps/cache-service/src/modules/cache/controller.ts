import {
  Controller,
  Get,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { CacheService } from "./service";

@Controller("cache")
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Get("search")
  async getCachedSearch(
    @Query("q") query: string,
    @Query("page") page: string = "1",
    @Query("size") size: string = "10"
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;

    const cached = await this.cacheService.get(query, pageNum, sizeNum);

    if (cached) {
      return {
        source: "cache",
        ...cached,
      };
    }

    return {
      source: "cache",
      data: null,
      message: "No cached data found",
    };
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
}
