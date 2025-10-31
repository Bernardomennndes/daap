/**
 * Cache Metrics Service
 *
 * Métricas Prometheus específicas para operações de cache
 */

import { getMeter } from './metrics';
import type { Counter, Histogram, ObservableGauge, Meter } from '@opentelemetry/api';

export class CacheMetricsService {
  private readonly meter: Meter;

  // Counters
  private readonly requestsCounter: Counter;
  private readonly evictionsCounter: Counter;
  private readonly hitsCounter: Counter;
  private readonly missesCounter: Counter;

  // Gauges (observables)
  private entriesGauge: ObservableGauge | null = null;
  private utilizationGauge: ObservableGauge | null = null;

  // Histograms
  private readonly operationDuration: Histogram;
  private readonly evictionDuration: Histogram;
  private readonly evictionEntriesRemoved: Histogram;

  constructor(serviceName: string = 'cache-service') {
    this.meter = getMeter(serviceName);

    // === Counters ===
    this.requestsCounter = this.meter.createCounter('cache_requests_total', {
      description: 'Total number of cache requests',
      unit: '1',
    });

    this.evictionsCounter = this.meter.createCounter('cache_evictions_total', {
      description: 'Total number of cache evictions executed',
      unit: '1',
    });

    this.hitsCounter = this.meter.createCounter('cache_hits_total', {
      description: 'Total number of cache hits (normalized + fuzzy)',
      unit: '1',
    });

    this.missesCounter = this.meter.createCounter('cache_misses_total', {
      description: 'Total number of cache misses',
      unit: '1',
    });

    // === Histograms ===
    this.operationDuration = this.meter.createHistogram('cache_operation_duration_seconds', {
      description: 'Duration of cache operations (get, set, etc)',
      unit: 's',
    });

    this.evictionDuration = this.meter.createHistogram('cache_eviction_duration_seconds', {
      description: 'Duration of cache eviction process',
      unit: 's',
    });

    this.evictionEntriesRemoved = this.meter.createHistogram('cache_eviction_entries_removed', {
      description: 'Number of entries removed during each eviction',
      unit: '1',
    });
  }

  // === Counter Methods ===

  /**
   * Registra uma requisição ao cache
   */
  recordRequest(strategy: string, hitType: 'normalized' | 'fuzzy' | 'miss') {
    this.requestsCounter.add(1, { strategy, hit_type: hitType });

    if (hitType !== 'miss') {
      this.hitsCounter.add(1, { strategy, type: hitType });
    } else {
      this.missesCounter.add(1, { strategy });
    }
  }

  /**
   * Registra uma eviction executada
   */
  recordEviction(strategy: string) {
    this.evictionsCounter.add(1, { strategy });
  }

  // === Histogram Methods ===

  /**
   * Registra duração de uma operação de cache
   */
  recordOperationDuration(operation: string, strategy: string, durationSeconds: number) {
    this.operationDuration.record(durationSeconds, { operation, strategy });
  }

  /**
   * Registra duração de uma eviction
   */
  recordEvictionDuration(strategy: string, durationSeconds: number) {
    this.evictionDuration.record(durationSeconds, { strategy });
  }

  /**
   * Registra número de entries removidas em uma eviction
   */
  recordEvictionEntriesRemoved(strategy: string, count: number) {
    this.evictionEntriesRemoved.record(count, { strategy });
  }

  // === Observable Gauge Methods ===

  /**
   * Registra callback para o gauge de número de entries
   */
  registerEntriesGaugeCallback(callback: (strategy: string) => Promise<number>) {
    if (!this.entriesGauge) {
      this.entriesGauge = this.meter.createObservableGauge('cache_entries_current', {
        description: 'Current number of entries in cache',
        unit: '1',
      });

      this.entriesGauge.addCallback(async (result) => {
        const strategies = ['lfu', 'lru', 'hybrid'];
        for (const strategy of strategies) {
          try {
            const value = await callback(strategy);
            result.observe(value, { strategy });
          } catch (error) {
            // Silently ignore errors in callbacks
          }
        }
      });
    }
  }

  /**
   * Registra callback para o gauge de utilização
   */
  registerUtilizationGaugeCallback(callback: (strategy: string) => Promise<number>) {
    if (!this.utilizationGauge) {
      this.utilizationGauge = this.meter.createObservableGauge('cache_utilization_percent', {
        description: 'Cache utilization percentage (0-100)',
        unit: '%',
      });

      this.utilizationGauge.addCallback(async (result) => {
        const strategies = ['lfu', 'lru', 'hybrid'];
        for (const strategy of strategies) {
          try {
            const value = await callback(strategy);
            result.observe(value, { strategy });
          } catch (error) {
            // Silently ignore errors in callbacks
          }
        }
      });
    }
  }
}

export default CacheMetricsService;
