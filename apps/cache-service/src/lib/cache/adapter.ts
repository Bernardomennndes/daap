// Abstração para diferentes sistemas de cache
export abstract class CacheAdapter {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string, ttl?: number): Promise<void>;
  abstract del(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract flush(): Promise<void>;
}
