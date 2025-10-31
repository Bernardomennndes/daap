#!/usr/bin/env node

/**
 * Jaeger Trace Collector
 *
 * Coleta traces de eviction do Jaeger API e extrai métricas estruturadas.
 *
 * Usage:
 *   ts-node jaeger-collector.ts <lfu|lru|hybrid> [lookbackHours] [limit]
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface JaegerTag {
  key: string;
  type: string;
  value: any;
}

interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  duration: number; // microseconds
  startTime: number; // microseconds
  tags: JaegerTag[];
}

interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
}

interface EvictionMetrics {
  traceId: string;
  timestamp: number;
  strategy: string;
  triggered: boolean;
  entriesBefore: number;
  entriesAfter: number;
  entriesEvicted: number;
  durationMs: number;
  scoreAvg: number;
  scoreMin: number;
  scoreMax: number;
  utilizationBefore: number;
  utilizationAfter: number;
}

export class JaegerCollector {
  private readonly jaegerUrl: string;
  private readonly outputDir: string;

  constructor(jaegerUrl = 'http://localhost:16686') {
    this.jaegerUrl = jaegerUrl;
    this.outputDir = path.join(__dirname, '../results/traces');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Busca traces do Jaeger para uma estratégia específica
   */
  async fetchEvictionTraces(
    strategy: 'lfu' | 'lru' | 'hybrid',
    lookbackHours: number = 1,
    limit: number = 1000
  ): Promise<EvictionMetrics[]> {
    const endTime = Date.now() * 1000; // microseconds
    const startTime = endTime - (lookbackHours * 60 * 60 * 1000 * 1000);

    console.log(`🔍 Fetching ${strategy.toUpperCase()} eviction traces...`);
    console.log(`   Time range: ${new Date(startTime/1000).toISOString()} to ${new Date(endTime/1000).toISOString()}`);

    try {
      const response = await axios.get(`${this.jaegerUrl}/api/traces`, {
        params: {
          service: 'cache-service',
          operation: 'cache.eviction.check',
          limit,
          start: startTime,
          end: endTime,
        },
      });

      const traces: JaegerTrace[] = response.data.data || [];
      console.log(`   Found ${traces.length} traces`);

      const metrics: EvictionMetrics[] = [];

      for (const trace of traces) {
        for (const span of trace.spans) {
          if (span.operationName === 'cache.eviction.check') {
            const tags = this.parseSpanTags(span.tags);

            // Filtra por estratégia
            if (tags['eviction.strategy'] !== strategy) {
              continue;
            }

            // Só adiciona se eviction foi triggada
            if (tags['eviction.triggered'] === true) {
              metrics.push({
                traceId: trace.traceID,
                timestamp: span.startTime / 1000, // convert to ms
                strategy: tags['eviction.strategy'] || strategy,
                triggered: tags['eviction.triggered'] === true,
                entriesBefore: tags['eviction.entries.before'] || 0,
                entriesAfter: tags['eviction.entries.after'] || 0,
                entriesEvicted: tags['eviction.entries.evicted'] || 0,
                durationMs: tags['eviction.duration_ms'] || 0,
                scoreAvg: tags['eviction.score.avg'] || 0,
                scoreMin: tags['eviction.score.min'] || 0,
                scoreMax: tags['eviction.score.max'] || 0,
                utilizationBefore: tags['eviction.utilization_before'] || 0,
                utilizationAfter: tags['eviction.utilization_after'] || 0,
              });
            }
          }
        }
      }

      console.log(`   ✅ Extracted ${metrics.length} eviction events`);
      return metrics;
    } catch (error: any) {
      console.error(`   ❌ Error fetching traces:`, error.message);
      return [];
    }
  }

  /**
   * Converte tags do Jaeger para objeto
   */
  private parseSpanTags(tags: JaegerTag[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const tag of tags) {
      result[tag.key] = tag.value;
    }
    return result;
  }

  /**
   * Salva métricas em arquivo JSON
   */
  async saveMetrics(strategy: string, metrics: EvictionMetrics[]): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${strategy}-eviction-metrics-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2));
    console.log(`💾 Saved to: ${filepath}`);

    return filepath;
  }

  /**
   * Busca cache hit rate do endpoint REST
   */
  async fetchCacheHitRate(cacheServiceUrl = 'http://cache.localhost'): Promise<{
    normalized: number;
    fuzzy: number;
    miss: number;
    total: number;
    hitRate: string;
  }> {
    try {
      const response = await axios.get(`${cacheServiceUrl}/cache/metrics/hit-types`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching cache hit rate:', error.message);
      return {
        normalized: 0,
        fuzzy: 0,
        miss: 0,
        total: 0,
        hitRate: '0%',
      };
    }
  }
}

// CLI
if (require.main === module) {
  const [strategy, lookback, limit] = process.argv.slice(2);

  if (!strategy || !['lfu', 'lru', 'hybrid'].includes(strategy)) {
    console.error('Usage: ts-node jaeger-collector.ts <lfu|lru|hybrid> [lookbackHours] [limit]');
    process.exit(1);
  }

  const collector = new JaegerCollector();

  (async () => {
    const metrics = await collector.fetchEvictionTraces(
      strategy as any,
      parseInt(lookback) || 1,
      parseInt(limit) || 1000
    );

    await collector.saveMetrics(strategy, metrics);

    const hitRate = await collector.fetchCacheHitRate();
    console.log('\n📊 Current Cache Hit Rate:', hitRate);
  })();
}

export default JaegerCollector;
