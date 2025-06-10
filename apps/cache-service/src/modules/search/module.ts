import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModuleDomain } from '../cache/module';
import { SearchService } from './service';
import { SearchController } from './controller';

@Module({
  imports: [
    CacheModuleDomain,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
