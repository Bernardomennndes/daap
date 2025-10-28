// Abstração para diferentes sistemas de cache
export abstract class CacheAdapter {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string, ttl?: number): Promise<void>;
  abstract del(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract flush(): Promise<void>;
  
  // Métodos para LFU (Sorted Sets)
  abstract zadd(key: string, score: number, member: string): Promise<void>;
  abstract zincrby(key: string, increment: number, member: string): Promise<number>;
  abstract zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  abstract zrange(key: string, start: number, stop: number): Promise<string[]>;
  
  // Métodos para LFU (Sets)
  abstract sadd(key: string, ...members: string[]): Promise<number>;
  abstract smembers(key: string): Promise<string[]>;
  abstract srem(key: string, ...members: string[]): Promise<number>;
  
  // Métodos auxiliares
  abstract keys(pattern: string): Promise<string[]>;
}
