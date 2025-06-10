import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchModule } from './modules/search/module';
import { HealthModule } from './modules/health/module';
import { GlobalModule } from './lib/modules/global/module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/daap'),
    SearchModule,
    HealthModule,
    GlobalModule,
  ],
})
export class MainModule {}
