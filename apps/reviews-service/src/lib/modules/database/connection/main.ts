import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ISecretsService } from '../../global/secrets/adapter';
import { SecretsModule } from '../../global/secrets/module';
import { IDataBaseService, IRepository } from '../adapter';
import { ConnectionName } from '../enum';
import { Repository } from '../repository';
import { DataBaseService } from '../service';

@Module({
  providers: [
    {
      provide: IDataBaseService,
      useClass: DataBaseService,
    },
    {
      provide: IRepository,
      useClass: Repository,
    },
  ],
  imports: [
    SecretsModule,
    MongooseModule.forRootAsync({
      connectionName: ConnectionName.MAIN,
      useFactory: ({ database: { host, port, pass, user } }: ISecretsService) =>
        new DataBaseService().getDefaultConnection({ dbName: 'amazon', host, pass, user, port }),
      inject: [ISecretsService],
    }),
  ],
})
export class MainDatabaseModule {}
