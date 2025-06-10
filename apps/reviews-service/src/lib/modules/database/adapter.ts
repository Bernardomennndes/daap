import { MongooseModuleOptions } from '@nestjs/mongoose';
import { QueryOptions, RootFilterQuery, SaveOptions, UpdateQuery, UpdateWithAggregationPipeline } from 'mongoose';

import { ConnectionModel, CreatedModel, RemovedModel, UpdatedModel } from './types';

export abstract class IDataBaseService {
  abstract getDefaultConnection<T = MongooseModuleOptions>(options?: ConnectionModel): T;
}

export abstract class IRepository<T> {
  abstract isConnected(): Promise<void>;

  abstract create<T = SaveOptions>(document: object, saveOptions?: T): Promise<CreatedModel>;

  abstract findById(id: string | number): Promise<T>;

  abstract findAll(): Promise<T[]>;

  abstract find<TQuery = RootFilterQuery<T>, TOptions = QueryOptions<T>>(
    filter: TQuery,
    options?: TOptions | null,
  ): Promise<T[]>;

  abstract deleteOne<TQuery = RootFilterQuery<T>>(filter: TQuery): Promise<RemovedModel>;

  abstract findOne<TQuery = RootFilterQuery<T>, TOptions = QueryOptions<T>>(
    filter: TQuery,
    options?: TOptions,
  ): Promise<T>;

  abstract updateOne<
    TQuery = RootFilterQuery<T>,
    TUpdate = UpdateQuery<T> | UpdateWithAggregationPipeline,
    TOptions = QueryOptions<T>,
  >(filter: TQuery, updated: TUpdate, options?: TOptions): Promise<UpdatedModel>;

  abstract updateMany<
    TQuery = RootFilterQuery<T>,
    TUpdate = UpdateQuery<T> | UpdateWithAggregationPipeline,
    TOptions = QueryOptions<T>,
  >(filter: TQuery, updated: TUpdate, options?: TOptions): Promise<UpdatedModel>;
}
