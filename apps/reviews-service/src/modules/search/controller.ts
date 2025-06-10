import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '10'
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;
    
    return this.searchService.search(query, pageNum, sizeNum);
  }
}
