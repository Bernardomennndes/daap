import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretsService extends ConfigService {
  constructor() {
    super();
  }

  MONGO_URI = this.get('MONGO_URI', 'mongodb://localhost:27017/daap');
  PORT = this.get('PORT', '3003');
}
