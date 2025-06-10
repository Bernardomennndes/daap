import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { CacheAdapter } from "../adapter";
import { CacheConfig } from "../types";

@Injectable()
export class RedisAdapter
  extends CacheAdapter
  implements OnModuleInit, OnModuleDestroy
{
  private client: Redis;

  constructor(private config: CacheConfig) {
    super();
    console.log('RedisAdapter: constructor called with config:', config);
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
    });
    console.log('RedisAdapter: Redis client created');
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    console.log('RedisAdapter: attempting to connect...');
    try {
      await this.client.ping();
      console.log('RedisAdapter: connection successful');
    } catch (error) {
      console.error('RedisAdapter: connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async flush(): Promise<void> {
    await this.client.flushdb();
  }
}
