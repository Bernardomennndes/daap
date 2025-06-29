import { UpdateOptions as _UpdateOptions } from 'mongodb';
import { MongooseUpdateQueryOptions, ObjectId } from 'mongoose';

export type ConnectionModel = {
  host: string;
  port: string | number;
  user: string;
  pass: string;
  dbName: string;
};

export type UpdatedModel = {
  matchedCount: number;
  modifiedCount: number;
  acknowledged: boolean;
  upsertedId: unknown | ObjectId;
  upsertedCount: number;
};

export type RemovedModel = {
  deletedCount: number;
  deleted: boolean;
};

export type CreatedModel = {
  id: string;
  created: boolean;
};

export type UpdateOptions<T> = (_UpdateOptions & MongooseUpdateQueryOptions<T>) | null;
