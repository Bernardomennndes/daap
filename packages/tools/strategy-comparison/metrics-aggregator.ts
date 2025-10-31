#!/usr/bin/env node

/**
 * Metrics Aggregator
 *
 * Agrega métricas de eviction de arquivos JSON gerados pelo Jaeger Collector.
 *
 * Usage:
 *   ts-node metrics-aggregator.ts <filepath.json>
 */

import fs from 'fs';
import path from 'path';

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

export interface AggregatedMetrics {
  strategy: string;
  totalEvictions: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  avgEntriesEvicted: number;
  totalEntriesEvicted: number;
  avgScoreBefore: number;
  avgUtilizationBefore: number;
  avgUtilizationAfter: number;
  evictionEfficiency: number; // entries evicted / duration
}

export class MetricsAggregator {
  /**
   * Agrega métricas de um array de evictions
   */
  aggregate(metrics: EvictionMetrics[]): AggregatedMetrics {
    if (metrics.length === 0) {
      throw new Error('No metrics to aggregate');
    }

    const strategy = metrics[0].strategy;

    // Durations
    const durations = metrics.map(m => m.durationMs).sort((a, b) => a - b);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const p50Duration = this.percentile(durations, 50);
    const p95Duration = this.percentile(durations, 95);
    const p99Duration = this.percentile(durations, 99);

    // Entries evicted
    const entriesEvicted = metrics.map(m => m.entriesEvicted);
    const avgEntriesEvicted = entriesEvicted.reduce((a, b) => a + b, 0) / entriesEvicted.length;
    const totalEntriesEvicted = entriesEvicted.reduce((a, b) => a + b, 0);

    // Scores
    const scores = metrics.map(m => m.scoreAvg);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Utilization
    const utilizationBefore = metrics.map(m => m.utilizationBefore);
    const utilizationAfter = metrics.map(m => m.utilizationAfter);
    const avgUtilBefore = utilizationBefore.reduce((a, b) => a + b, 0) / utilizationBefore.length;
    const avgUtilAfter = utilizationAfter.reduce((a, b) => a + b, 0) / utilizationAfter.length;

    // Efficiency: entries per ms
    const efficiency = totalEntriesEvicted / (avgDuration * metrics.length);

    return {
      strategy,
      totalEvictions: metrics.length,
      avgDurationMs: Number(avgDuration.toFixed(2)),
      minDurationMs: minDuration,
      maxDurationMs: maxDuration,
      p50DurationMs: p50Duration,
      p95DurationMs: p95Duration,
      p99DurationMs: p99Duration,
      avgEntriesEvicted: Number(avgEntriesEvicted.toFixed(2)),
      totalEntriesEvicted,
      avgScoreBefore: Number(avgScore.toFixed(4)),
      avgUtilizationBefore: Number(avgUtilBefore.toFixed(2)),
      avgUtilizationAfter: Number(avgUtilAfter.toFixed(2)),
      evictionEfficiency: Number(efficiency.toFixed(4)),
    };
  }

  /**
   * Calcula percentil de um array ordenado
   */
  private percentile(sortedArray: number[], p: number): number {
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Lê arquivo de métricas JSON
   */
  loadMetrics(filepath: string): EvictionMetrics[] {
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Busca todos os arquivos de métricas no diretório
   */
  findMetricsFiles(strategy: string, dir: string): string[] {
    const files = fs.readdirSync(dir);
    return files
      .filter(f => f.startsWith(`${strategy}-eviction-metrics`) && f.endsWith('.json'))
      .map(f => path.join(dir, f));
  }
}

// CLI
if (require.main === module) {
  const [filepath] = process.argv.slice(2);

  if (!filepath) {
    console.error('Usage: ts-node metrics-aggregator.ts <filepath.json>');
    process.exit(1);
  }

  const aggregator = new MetricsAggregator();
  const metrics = aggregator.loadMetrics(filepath);
  const aggregated = aggregator.aggregate(metrics);

  console.log('\n📊 Aggregated Metrics:');
  console.log(JSON.stringify(aggregated, null, 2));
}

export default MetricsAggregator;
