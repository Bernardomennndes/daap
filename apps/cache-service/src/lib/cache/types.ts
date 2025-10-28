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
  keywords?: string[];
  frequency?: number;
}

export interface KeywordMetadata {
  keyword: string;
  frequency: number;
  lastAccess: number;
}

export interface CacheEntryMetadata {
  key: string;
  keywords: string[];
  frequency: number;
  lastAccess: number;
  created: number;
  size: number;
}

export interface LFUConfig {
  maxEntries: number;
  evictionBatchSize: number;
  keywordMinLength: number;
  stopWords: string[];
}

export interface KeywordStats {
  keyword: string;
  frequency: number;
  cacheEntries: number;
  lastAccess: number;
}

export interface EvictionCandidate {
  key: string;
  frequency: number;
  score: number;
  keywords: string[];
}
