export interface ISecretsService {
  MONGO_EXPRESS_URL: string;
  REDIS_COMMANDER_URL: string;
  JEAGER_URL: string;
  KIBANA_URL: string;
  REDIS_URL: string;
  ENV: string;
  LOG_LEVEL: string;
  database: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
}
