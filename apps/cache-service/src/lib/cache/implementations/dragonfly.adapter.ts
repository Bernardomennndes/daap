import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { CacheAdapter } from "../adapter";
import { CacheConfig } from "../types";

@Injectable()
export class DragonflyAdapter
  extends CacheAdapter
  implements OnModuleInit, OnModuleDestroy
{
  private client: Redis;

  constructor(private config: CacheConfig) {
    super();
    // Dragonfly é compatível com Redis, então usamos o mesmo cliente
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
    });
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    await this.client.ping();
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

  // Implementação dos métodos LFU - Sorted Sets
  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zincrby(key: string, increment: number, member: string): Promise<number> {
    const result = await this.client.zincrby(key, increment, member);
    return parseFloat(result);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zrevrange(key, start, stop);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zrange(key, start, stop);
  }

  // Implementação dos métodos LFU - Sets
  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.client.sadd(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.client.smembers(key);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.client.srem(key, ...members);
  }

  // Métodos auxiliares
  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }
}
