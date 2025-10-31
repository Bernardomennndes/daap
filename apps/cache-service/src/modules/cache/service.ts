import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { CacheAdapter } from "../../lib/cache/adapter";
import { SearchResult, CacheEntry } from "../../lib/cache/types";
import { KeywordService } from "../../lib/cache/keyword.service";
import { EvictionStrategy } from "../../lib/cache/eviction-strategy.interface";
import {
  getTracingService,
  CacheMetricsService,
  CACHE_QUERY,
  CACHE_PAGE,
  CACHE_SIZE,
  CACHE_KEY,
  CACHE_HIT,
  CACHE_HIT_TYPE,
  CACHE_FUZZY_SIMILARITY,
  KEYWORD_COUNT,
} from '@daap/telemetry';

interface FuzzyMatchCandidate {
  key: string;
  similarity: number;
  keywords: string[];
}

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private readonly tracing = getTracingService('cache-service');
  private readonly metrics = new CacheMetricsService('cache-service');

  // ✅ SOLUÇÃO 2: Configurações de Fuzzy Matching
  private readonly FUZZY_ENABLED = process.env.ENABLE_FUZZY_CACHE === 'true';
  private readonly FUZZY_THRESHOLD = parseFloat(
    process.env.FUZZY_SIMILARITY_THRESHOLD || '0.7'
  );
  private readonly FUZZY_MAX_CANDIDATES = parseInt(
    process.env.FUZZY_MAX_CANDIDATES || '10'
  );

  constructor(
    private readonly cacheAdapter: CacheAdapter,
    private readonly keywordService: KeywordService,
    private readonly evictionStrategy: EvictionStrategy
  ) {
    // Registrar callbacks para Observable Gauges
    this.metrics.registerEntriesGaugeCallback(async (strategy) => {
      const info = await this.evictionStrategy.getCacheInfo();
      return info.strategyName.toLowerCase() === strategy ? info.totalEntries : 0;
    });

    this.metrics.registerUtilizationGaugeCallback(async (strategy) => {
      const info = await this.evictionStrategy.getCacheInfo();
      return info.strategyName.toLowerCase() === strategy ? info.utilizationPercentage : 0;
    });
  }

  onModuleInit() {
    this.logger.log(
      `Cache Service initialized - Fuzzy Matching: ${this.FUZZY_ENABLED ? 'ON' : 'OFF'}`
    );
    if (this.FUZZY_ENABLED) {
      this.logger.log(
        `Fuzzy threshold: ${this.FUZZY_THRESHOLD}, Max candidates: ${this.FUZZY_MAX_CANDIDATES}`
      );
    }
  }

  /**
   * ✅ SOLUÇÃO 1: Normaliza query ordenando keywords alfabeticamente
   * Queries com mesmas palavras em ordem diferente geram mesma chave
   * Ex: "laptop charger" e "charger laptop" → "search:charger laptop:1:10"
   */
  private generateCacheKey(query: string, page: number, size: number): string {
    const keywords = this.keywordService.extractKeywords(query);
    keywords.sort();  // Ordenação alfabética
    const normalizedQuery = keywords.join(' ');
    return `search:${normalizedQuery}:${page}:${size}`;
  }

  /**
   * Busca com fallback: normalizado → fuzzy → null
   * ✅ SOLUÇÃO 1 + 2 + 3 combinadas
   */
  async get(
    query: string,
    page: number,
    size: number
  ): Promise<SearchResult | null> {
    return this.tracing.startActiveSpan(
      'cache.get',
      async (span) => {
        span.setAttributes({
          [CACHE_QUERY]: query,
          [CACHE_PAGE]: page,
          [CACHE_SIZE]: size,
        });

        const startTime = Date.now();

        // NÍVEL 1: Busca normalizada (com stemming)
        const key = this.generateCacheKey(query, page, size);
        const cached = await this.tracing.startActiveSpan(
          'cache.lookup.normalized',
          async (lookupSpan) => {
            lookupSpan.setAttributes({ [CACHE_KEY]: key });
            const result = await this.cacheAdapter.get(key);
            lookupSpan.setAttributes({ [CACHE_HIT]: !!result });
            return result;
          }
        );

        if (cached) {
          const result = await this.parseCacheEntry(cached, key);
          if (result) {
            const strategy = this.evictionStrategy.getStrategyName().toLowerCase();
            const duration = (Date.now() - startTime) / 1000;

            span.setAttributes({ [CACHE_HIT_TYPE]: 'normalized' });
            this.logCacheHit('normalized', Date.now() - startTime);

            // Registrar métricas Prometheus
            this.metrics.recordRequest(strategy, 'normalized');
            this.metrics.recordOperationDuration('get', strategy, duration);

            return result;
          }
        }

        // NÍVEL 2: Fuzzy matching (se habilitado)
        if (this.FUZZY_ENABLED) {
          const fuzzyResult = await this.tracing.startActiveSpan(
            'cache.lookup.fuzzy',
            async (fuzzySpan) => {
              const result = await this.findPartialMatch(query, page, size);
              fuzzySpan.setAttributes({
                [CACHE_HIT]: !!result,
                [CACHE_FUZZY_SIMILARITY]: result?._cacheMetadata?.similarity || 0,
              });
              return result;
            }
          );

          if (fuzzyResult) {
            const strategy = this.evictionStrategy.getStrategyName().toLowerCase();
            const duration = (Date.now() - startTime) / 1000;

            span.setAttributes({ [CACHE_HIT_TYPE]: 'fuzzy' });
            this.logCacheHit('fuzzy', Date.now() - startTime);

            // Registrar métricas Prometheus
            this.metrics.recordRequest(strategy, 'fuzzy');
            this.metrics.recordOperationDuration('get', strategy, duration);

            return fuzzyResult;
          }
        }

        // Cache miss
        const strategy = this.evictionStrategy.getStrategyName().toLowerCase();
        const duration = (Date.now() - startTime) / 1000;

        span.setAttributes({ [CACHE_HIT_TYPE]: 'miss' });
        this.logCacheHit('miss', Date.now() - startTime);

        // Registrar métricas Prometheus
        this.metrics.recordRequest(strategy, 'miss');
        this.metrics.recordOperationDuration('get', strategy, duration);

        return null;
      }
    );
  }

  /**
   * Parse e valida cache entry
   */
  private async parseCacheEntry(
    cached: string,
    key: string
  ): Promise<SearchResult | null> {
    try {
      const entry: CacheEntry = JSON.parse(cached);

      // Valida TTL
      if (Date.now() - entry.timestamp > entry.ttl * 1000) {
        await this.cacheAdapter.del(key);
        return null;
      }

      // Registra acesso para estratégia de eviction
      await this.evictionStrategy.recordAccess(key);

      return entry.data;
    } catch (error) {
      this.logger.error(`Error parsing cache entry: ${error}`);
      await this.cacheAdapter.del(key);
      return null;
    }
  }

  /**
   * ✅ SOLUÇÃO 2: Fuzzy matching com threshold configurável
   * Busca queries similares baseado em keywords em comum
   */
  private async findPartialMatch(
    query: string,
    page: number,
    size: number
  ): Promise<SearchResult | null> {
    const queryKeywords = this.keywordService.extractKeywords(query);

    if (queryKeywords.length === 0) {
      return null;
    }

    const candidates: FuzzyMatchCandidate[] = [];
    const seenKeys = new Set<string>();

    // Busca por cada keyword da query
    for (const keyword of queryKeywords) {
      const normalized = this.keywordService.normalizeKeyword(keyword);
      const keysWithKeyword = await this.cacheAdapter.smembers(
        `keyword:keys:${normalized}`
      );

      for (const candidateKey of keysWithKeyword) {
        // Evita duplicatas
        if (seenKeys.has(candidateKey)) continue;
        seenKeys.add(candidateKey);

        // Filtra por page e size
        if (!candidateKey.endsWith(`:${page}:${size}`)) continue;

        // Limita número de candidatos (performance)
        if (candidates.length >= this.FUZZY_MAX_CANDIDATES) break;

        // Calcula similaridade
        const similarity = await this.calculateCandidateSimilarity(
          candidateKey,
          queryKeywords
        );

        if (similarity >= this.FUZZY_THRESHOLD) {
          candidates.push({
            key: candidateKey,
            similarity,
            keywords: queryKeywords
          });
        }
      }

      if (candidates.length >= this.FUZZY_MAX_CANDIDATES) break;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Ordena por similaridade (maior primeiro)
    candidates.sort((a, b) => b.similarity - a.similarity);
    const bestMatch = candidates[0];

    this.logger.debug(
      `Fuzzy match found: ${bestMatch.key} (similarity: ${bestMatch.similarity.toFixed(2)})`
    );

    // Busca e retorna
    const cached = await this.cacheAdapter.get(bestMatch.key);
    if (!cached) return null;

    const result = await this.parseCacheEntry(cached, bestMatch.key);
    if (!result) return null;

    // Adiciona metadata de fuzzy match
    return {
      ...result,
      _cacheMetadata: {
        fuzzyMatch: true,
        similarity: bestMatch.similarity,
        originalKey: bestMatch.key
      }
    } as SearchResult;
  }

  /**
   * Calcula similaridade entre query e candidato usando Jaccard
   */
  private async calculateCandidateSimilarity(
    candidateKey: string,
    queryKeywords: string[]
  ): Promise<number> {
    try {
      const metaKey = `cache:meta:${candidateKey}`;
      const metaStr = await this.cacheAdapter.get(metaKey);

      if (!metaStr) return 0;

      const metadata = JSON.parse(metaStr);
      return this.keywordService.calculateSimilarity(
        queryKeywords,
        metadata.keywords
      );
    } catch (error) {
      return 0;
    }
  }

  /**
   * Logging de métricas de cache hit
   */
  private logCacheHit(
    type: 'normalized' | 'fuzzy' | 'miss',
    latencyMs: number
  ): void {
    this.logger.debug(`Cache ${type} - Latency: ${latencyMs}ms`);

    // Incrementa contador no Redis (async, não aguarda)
    try {
      const promise = this.cacheAdapter.zincrby('cache:metrics:hit_types', 1, type);
      if (promise && typeof promise.catch === 'function') {
        promise.catch(err => this.logger.error(`Error logging metrics: ${err}`));
      }
    } catch (err) {
      // Ignore errors in logging (non-critical)
    }
  }

  async set(
    query: string,
    page: number,
    size: number,
    data: SearchResult,
    ttl: number = 4 * 24 * 60 * 60 // 4 dias
  ): Promise<void> {
    return this.tracing.startActiveSpan('cache.set', async (span) => {
      const key = this.generateCacheKey(query, page, size);

      // Extrai keywords da query
      const keywords = this.keywordService.extractKeywords(query);

      span.setAttributes({
        [CACHE_KEY]: key,
        [KEYWORD_COUNT]: keywords.length,
      });

      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        ttl,
        keywords,
        frequency: 1
      };

      const entryStr = JSON.stringify(entry);
      await this.cacheAdapter.set(key, entryStr, ttl);

      // Registra na estratégia de eviction
      await this.evictionStrategy.registerCacheEntry(
        key,
        keywords,
        entryStr.length
      );

      // Verifica se precisa fazer eviction
      await this.tracing.startActiveSpan('cache.eviction.check', async () => {
        await this.evictionStrategy.checkAndEvict();
      });
    });
  }

  async invalidate(query?: string): Promise<void> {
    if (query) {
      // Remove apenas caches relacionados à query específica
      // Implementação simplificada - em produção, usar padrões de chave
      const key = this.generateCacheKey(query, 1, 10);
      await this.cacheAdapter.del(key);
    } else {
      // Remove todo o cache
      await this.cacheAdapter.flush();
      // Limpa estruturas da estratégia de eviction
      await this.evictionStrategy.clearAll();
    }
  }

  async exists(query: string, page: number, size: number): Promise<boolean> {
    const key = this.generateCacheKey(query, page, size);
    return await this.cacheAdapter.exists(key);
  }

  // Métodos para estatísticas e gerenciamento de eviction
  async getKeywordStatistics(limit: number = 50) {
    return await this.evictionStrategy.getKeywordStats(limit);
  }

  async getCacheInfo() {
    return await this.evictionStrategy.getCacheInfo();
  }

  async manualEviction(count: number) {
    const candidates = await this.evictionStrategy.findEntriesForEviction(count);
    await this.evictionStrategy.evict(candidates);
    return {
      evicted: candidates.length,
      candidates: candidates.map(c => ({
        key: c.key,
        frequency: c.frequency,
        score: c.score
      }))
    };
  }

  /**
   * ✅ NOVO: Métricas de cache hit (normalized, fuzzy, miss)
   */
  async getCacheMetrics() {
    try {
      const metricsData = await this.cacheAdapter.zrevrange(
        'cache:metrics:hit_types',
        0,
        -1
      );

      const result: Record<string, number> = {
        normalized: 0,
        fuzzy: 0,
        miss: 0
      };

      // Parse Redis sorted set response (alternates: member, score, member, score...)
      for (let i = 0; i < metricsData.length; i += 2) {
        const type = metricsData[i];
        const count = parseInt(metricsData[i + 1] || '0');
        if (type in result) {
          result[type] = count;
        }
      }

      const total = result.normalized + result.fuzzy + result.miss;
      const hitRate = total > 0
        ? ((result.normalized + result.fuzzy) / total * 100).toFixed(2)
        : '0.00';

      return {
        normalized: result.normalized,
        fuzzy: result.fuzzy,
        miss: result.miss,
        total,
        hitRate: `${hitRate}%`
      };
    } catch (error) {
      this.logger.error(`Error getting cache metrics: ${error}`);
      return {
        normalized: 0,
        fuzzy: 0,
        miss: 0,
        total: 0,
        hitRate: '0.00%'
      };
    }
  }
}
