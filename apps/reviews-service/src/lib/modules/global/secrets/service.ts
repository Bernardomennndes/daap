import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LevelWithSilent } from 'pino';

import { ISecretsService } from './adapter';
import { AuthAPIEnvironment, MainAPIEnvironment, ReviewsAPIEnvironment } from './enum';

@Injectable()
export class SecretsService extends ConfigService implements ISecretsService {
  constructor() {
    super();
  }

  ELK_URL = this.get('ELK_URL');

  MONGO_EXPRESS_URL = this.get('MONGO_EXPRESS_URL');
  REDIS_COMMANDER_URL = this.get('REDIS_COMMANDER_URL');
  JEAGER_URL = this.get('JEAGER_URL');
  KIBANA_URL = this.get('KIBANA_URL');

  REDIS_URL = this.get('REDIS_URL');

  ENV = this.get('ENV');

  LOG_LEVEL = this.get<LevelWithSilent>('LOG_LEVEL');

  database = {
    host: this.get('MONGO_HOST'),
    port: this.get<number>('MONGO_PORT'),
    user: this.get('MONGO_INITDB_ROOT_USERNAME'),
    pass: this.get('MONGO_INITDB_ROOT_PASSWORD'),
  };

  reviewsAPI = {
    port: this.get<number>(ReviewsAPIEnvironment.PORT, 3001),
    url: this.get(ReviewsAPIEnvironment.URL, 'http://0.0.0.0:3001'),
  };

  mainAPI = {
    port: this.get<number>(MainAPIEnvironment.PORT),
    url: this.get(MainAPIEnvironment.URL),
  };

  authAPI = {
    port: this.get<number>(AuthAPIEnvironment.PORT),
    jwtToken: this.get(AuthAPIEnvironment.SECRET_JWT),
    url: this.get(AuthAPIEnvironment.URL),
  };

  GITHUB_SCRAP_API = this.get('GITHUB_SCRAP_API');
  
  CACHE_SERVICE_URL = this.get('CACHE_SERVICE_URL', 'http://localhost:3002');
}
