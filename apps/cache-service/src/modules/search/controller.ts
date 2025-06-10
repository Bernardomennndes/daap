import { Controller, Get, Query, OnModuleInit } from '@nestjs/common';
import { SearchService } from './service';

@Controller('search')
export class SearchController implements OnModuleInit {
  constructor(private readonly searchService: SearchService) {
    console.log('SearchController: constructor called');
    console.log('SearchController: searchService is:', searchService);
  }

  onModuleInit() {
    console.log('SearchController: onModuleInit called');
    console.log('SearchController: searchService is:', this.searchService);
    console.log('SearchController: searchService constructor name:', this.searchService?.constructor?.name);
  }

  @Get()
  async search(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '10'
  ) {
    console.log('SearchController: search method called');
    console.log('SearchController: searchService is:', this.searchService);
    console.log('SearchController: searchService constructor:', this.searchService?.constructor?.name);
    
    if (!this.searchService) {
      console.error('SearchController: searchService is undefined!');
      throw new Error('SearchService is not available');
    }
    
    const pageNum = parseInt(page, 10) || 1;
    const sizeNum = parseInt(size, 10) || 10;
    
    console.log(`SearchController: calling searchService.search with query="${query}", page=${pageNum}, size=${sizeNum}`);
    return this.searchService.search(query, pageNum, sizeNum);
  }
}
