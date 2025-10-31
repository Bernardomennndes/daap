/**
 * Custom semantic conventions para DAAP
 * Referência: https://opentelemetry.io/docs/specs/semconv/
 */

// Cache operations
export const CACHE_OPERATION = 'cache.operation';
export const CACHE_KEY = 'cache.key';
export const CACHE_HIT = 'cache.hit';
export const CACHE_HIT_TYPE = 'cache.hit_type'; // normalized, fuzzy, miss
export const CACHE_QUERY = 'cache.query';
export const CACHE_PAGE = 'cache.page';
export const CACHE_SIZE = 'cache.size';
export const CACHE_FUZZY_SIMILARITY = 'cache.fuzzy.similarity';
export const CACHE_FUZZY_CANDIDATES = 'cache.fuzzy.candidates';

// Eviction strategy
export const EVICTION_STRATEGY = 'eviction.strategy'; // lfu, lru, hybrid
export const EVICTION_TRIGGERED = 'eviction.triggered'; // boolean
export const EVICTION_ENTRIES_BEFORE = 'eviction.entries.before';
export const EVICTION_ENTRIES_AFTER = 'eviction.entries.after';
export const EVICTION_ENTRIES_COUNT = 'eviction.entries.count';
export const EVICTION_ENTRIES_EVICTED = 'eviction.entries.evicted';
export const EVICTION_THRESHOLD = 'eviction.threshold';
export const EVICTION_BATCH_SIZE = 'eviction.batch_size';
export const EVICTION_EXCESS_COUNT = 'eviction.excess_count';
export const EVICTION_CANDIDATES_COUNT = 'eviction.candidates.count';
export const EVICTION_SCORE_AVG = 'eviction.score.avg';
export const EVICTION_SCORE_MIN = 'eviction.score.min';
export const EVICTION_SCORE_MAX = 'eviction.score.max';
export const EVICTION_DURATION_MS = 'eviction.duration_ms';
export const EVICTION_UTILIZATION_BEFORE = 'eviction.utilization_before';
export const EVICTION_UTILIZATION_AFTER = 'eviction.utilization_after';

// Search operations
export const SEARCH_QUERY = 'search.query';
export const SEARCH_RESULTS_TOTAL = 'search.results.total';
export const SEARCH_RESULTS_RETURNED = 'search.results.returned';
export const SEARCH_MONGODB_COLLECTION = 'mongodb.collection';

// Keywords
export const KEYWORD_COUNT = 'keyword.count';
export const KEYWORD_EXTRACTION_METHOD = 'keyword.extraction.method'; // porter, stopwords
