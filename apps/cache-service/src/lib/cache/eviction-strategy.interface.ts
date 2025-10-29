import { EvictionCandidate, KeywordStats } from './types';

/**
 * Interface abstrata para estratégias de eviction de cache.
 * Permite alternar entre LFU, LRU, Hybrid ou outras implementações.
 */
export abstract class EvictionStrategy {
  /**
   * Registra um novo cache entry no sistema de eviction
   * @param cacheKey Chave do cache entry
   * @param keywords Keywords associadas ao entry
   * @param size Tamanho em bytes do entry
   */
  abstract registerCacheEntry(
    cacheKey: string,
    keywords: string[],
    size: number
  ): Promise<void>;

  /**
   * Registra um acesso a um cache entry existente
   * @param cacheKey Chave do cache entry acessado
   */
  abstract recordAccess(cacheKey: string): Promise<void>;

  /**
   * Verifica se é necessário fazer eviction e executa se necessário
   * @returns true se eviction foi executada, false caso contrário
   */
  abstract checkAndEvict(): Promise<boolean>;

  /**
   * Encontra entries candidatos para eviction
   * @param count Número de entries a encontrar
   * @returns Lista de candidatos ordenados por prioridade de eviction
   */
  abstract findEntriesForEviction(count: number): Promise<EvictionCandidate[]>;

  /**
   * Remove entries do cache
   * @param candidates Lista de candidatos a serem removidos
   */
  abstract evict(candidates: EvictionCandidate[]): Promise<void>;

  /**
   * Remove um entry específico do cache
   * @param cacheKey Chave do entry a ser removido
   */
  abstract evictEntry(cacheKey: string): Promise<void>;

  /**
   * Limpa todas as estruturas de eviction
   */
  abstract clearAll(): Promise<void>;

  /**
   * Retorna estatísticas sobre keywords
   * @param limit Número máximo de keywords a retornar
   */
  abstract getKeywordStats(limit: number): Promise<KeywordStats[]>;

  /**
   * Retorna informações sobre o estado atual do cache
   */
  abstract getCacheInfo(): Promise<{
    totalEntries: number;
    maxEntries: number;
    utilizationPercentage: number;
    topKeywords: string[];
    strategyName: string;
  }>;

  /**
   * Retorna o nome da estratégia
   */
  abstract getStrategyName(): string;
}
