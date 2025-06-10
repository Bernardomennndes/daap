import { AuthAPIEnvironment, MainAPIEnvironment } from './enum';

export abstract class ISecretsService {
  ENV: string;
  REDIS_URL: string;

  ELK_URL: string;

  MONGO_EXPRESS_URL: string;
  JEAGER_URL: string;
  REDIS_COMMANDER_URL: string;
  KIBANA_URL: string;

  LOG_LEVEL: string;

  database: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };

  mainAPI: {
    port: MainAPIEnvironment | number;
    url: MainAPIEnvironment | string;
  };

  authAPI: {
    port: AuthAPIEnvironment | number;
    jwtToken: AuthAPIEnvironment | string;
    url: AuthAPIEnvironment | string;
  };

  GITHUB_SCRAP_API: string;
  
  CACHE_SERVICE_URL: string;
}
