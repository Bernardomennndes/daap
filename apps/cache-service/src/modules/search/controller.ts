import { Controller, Get, Query, OnModuleInit } from "@nestjs/common";
import { SearchService } from "./service";

@Controller("search")
export class SearchController implements OnModuleInit {
  constructor(private readonly searchService: SearchService) {}

  onModuleInit() {}

  @Get()
  async search(
    @Query("q") query: string,
    @Query("page") page: string = "1",
    @Query("size") size: string = "10"
  ) {
    if (!this.searchService) {
      console.error("SearchController: searchService is undefined!");
      throw new Error("SearchService is not available");
    }

    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;

    return this.searchService.search(query, pageNum, sizeNum);
  }
}
