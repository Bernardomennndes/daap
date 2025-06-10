import { Controller, Get, Query } from "@nestjs/common";
import { SearchService } from "./service";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query("q") q: string,
    @Query("page") page = "1",
    @Query("size") size = "10"
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;

    return this.searchService.search(q, pageNum, sizeNum);
  }
}
