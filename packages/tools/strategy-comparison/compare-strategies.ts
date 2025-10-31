#!/usr/bin/env node

/**
 * Compare Strategies - Script Principal
 *
 * Orquestra a coleta de traces, agregação e geração de relatórios.
 *
 * Usage:
 *   ts-node compare-strategies.ts [lookbackHours]
 */

import { JaegerCollector } from './jaeger-collector';
import { MetricsAggregator } from './metrics-aggregator';
import { ReportGenerator } from './report-generator';
import path from 'path';

async function main() {
  console.log('🚀 DAAP - Strategy Comparison Tool\n');

  const strategies = ['lfu', 'lru', 'hybrid'] as const;
  const lookbackHours = parseInt(process.argv[2]) || 1;

  console.log(`📊 Configuration:`);
  console.log(`   - Lookback: ${lookbackHours} hour(s)`);
  console.log(`   - Strategies: ${strategies.map(s => s.toUpperCase()).join(', ')}`);
  console.log('');

  const collector = new JaegerCollector();
  const aggregator = new MetricsAggregator();
  const reporter = new ReportGenerator();

  const allMetrics = [];

  // 1. Coletar traces de cada estratégia
  for (const strategy of strategies) {
    console.log(`\n📊 Processing ${strategy.toUpperCase()}...`);

    const rawMetrics = await collector.fetchEvictionTraces(strategy, lookbackHours);

    if (rawMetrics.length === 0) {
      console.warn(`   ⚠️  No eviction events found for ${strategy}`);
      continue;
    }

    await collector.saveMetrics(strategy, rawMetrics);

    const aggregated = aggregator.aggregate(rawMetrics);
    allMetrics.push(aggregated);

    console.log(`   ✅ Aggregated ${rawMetrics.length} eviction events`);
  }

  // 2. Gerar relatórios
  if (allMetrics.length > 0) {
    console.log('\n\n📝 Generating comparison reports...');
    const outputDir = path.join(__dirname, '../results');
    reporter.generateFullReport(allMetrics, outputDir);

    console.log('\n✅ Comparison complete!');
    console.log('\n📊 Summary:');

    allMetrics.forEach(m => {
      console.log(`   ${m.strategy.toUpperCase()}: ${m.totalEvictions} evictions, avg ${m.avgDurationMs}ms`);
    });
  } else {
    console.error('\n❌ No metrics collected. Make sure evictions occurred during the lookback period.');
    console.log('\n💡 Tips:');
    console.log('   - Run load tests to trigger evictions');
    console.log('   - Reduce EVICTION_MAX_ENTRIES to trigger evictions sooner');
    console.log('   - Increase lookback hours: ts-node compare-strategies.ts 2');
  }
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
