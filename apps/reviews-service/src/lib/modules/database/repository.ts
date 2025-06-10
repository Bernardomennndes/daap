import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../../utils";
import {
  Model,
  QueryOptions,
  RootFilterQuery,
  SaveOptions,
  UpdateQuery,
  UpdateWithAggregationPipeline,
} from "mongoose";
import { Document } from "mongoose";

import { IRepository } from "./adapter";
import {
  CreatedModel,
  RemovedModel,
  UpdatedModel,
  UpdateOptions,
} from "./types";

export class Repository<T extends Document> implements IRepository<T> {
  constructor(private readonly model: Model<T>) {}

  async isConnected(): Promise<void> {
    if (this.model.db.readyState !== 1)
      throw new ApiException(
        `db ${this.model.db.name} disconnected`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Database"
      );
  }

  async create(
    document: object,
    saveOptions?: SaveOptions
  ): Promise<CreatedModel> {
    const createdEntity = new this.model(document);
    const savedResult = await createdEntity.save(saveOptions);

    return { id: savedResult.id, created: !!savedResult.id };
  }

  async find(filter: RootFilterQuery<T>, options?: QueryOptions): Promise<T[]> {
    return await this.model.find(filter, undefined, options);
  }

  async findById(id: string | number): Promise<T> {
    return await this.model.findById(id);
  }

  async findOne(
    filter: RootFilterQuery<T>,
    options?: QueryOptions
  ): Promise<T> {
    return await this.model.findOne(filter, undefined, options);
  }

  async findAll(): Promise<T[]> {
    return await this.model.find();
  }

  async deleteOne(filter: RootFilterQuery<T>): Promise<RemovedModel> {
    const { deletedCount } = await this.model.deleteOne(filter);
    return { deletedCount, deleted: !!deletedCount };
  }

  async updateOne(
    filter: RootFilterQuery<T>,
    updated: UpdateWithAggregationPipeline | UpdateQuery<T>,
    options?: UpdateOptions<T>
  ): Promise<UpdatedModel> {
    return await this.model.updateOne(filter, updated, options as any);
  }

  async updateMany(
    filter: RootFilterQuery<T>,
    updated: UpdateWithAggregationPipeline | UpdateQuery<T>,
    options?: UpdateOptions<T>
  ): Promise<UpdatedModel> {
    return await this.model.updateMany(filter, updated, options as any);
  }
}
