export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl?: number;
}

export interface SearchResult {
  items: any[];
  total: number;
  page: number;
  size: number;
}

export interface CacheEntry {
  data: SearchResult;
  timestamp: number;
  ttl: number;
}
