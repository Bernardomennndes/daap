import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretsService {
  constructor(private readonly configService: ConfigService) {}

  get CACHE_HOST() { return this.configService.get('CACHE_HOST', 'localhost'); }
  get CACHE_PORT() { return this.configService.get<number>('CACHE_PORT', 6379); }
  get CACHE_PASSWORD() { return this.configService.get('CACHE_PASSWORD'); }
  get CACHE_DB() { return this.configService.get<number>('CACHE_DB', 0); }
  get CACHE_TTL() { return this.configService.get<number>('CACHE_TTL', 3600); }
  get CACHE_TYPE() { return this.configService.get('CACHE_TYPE', 'redis'); }

  get SEARCH_SERVICE_URL() { return this.configService.get('SEARCH_SERVICE_URL', 'http://localhost:3003'); }
  
  get ENV() { return this.configService.get('ENV', 'development'); }
  get PORT() { return this.configService.get<number>('PORT', 3002); }
}
