import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsService } from './adapter';
import { SearchAPIEnvironment } from './enum';

@Injectable()
export class SecretsService extends ConfigService implements ISecretsService {
  constructor() {
    super();
  }

  MONGO_URI = this.get('MONGO_URI', 'mongodb://localhost:27017/daap');
  
  MONGO_EXPRESS_URL = this.get('MONGO_EXPRESS_URL');
  REDIS_COMMANDER_URL = this.get('REDIS_COMMANDER_URL');
  JEAGER_URL = this.get('JEAGER_URL');
  KIBANA_URL = this.get('KIBANA_URL');
  REDIS_URL = this.get('REDIS_URL');
  ENV = this.get('ENV', 'development');
  LOG_LEVEL = this.get('LOG_LEVEL', 'info');

  database = {
    host: this.get('MONGO_HOST', 'localhost'),
    port: this.get<number>('MONGO_PORT', 27017),
    user: this.get('MONGO_INITDB_ROOT_USERNAME', 'admin'),
    pass: this.get('MONGO_INITDB_ROOT_PASSWORD', 'admin'),
  };

  searchAPI = {
    port: this.get<number>(SearchAPIEnvironment.PORT, 3003),
    url: this.get(SearchAPIEnvironment.URL, 'http://0.0.0.0:3003'),
  };

  // Backward compatibility
  PORT = this.searchAPI.port;
}
