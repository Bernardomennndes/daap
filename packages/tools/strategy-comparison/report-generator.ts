#!/usr/bin/env node

/**
 * Report Generator
 *
 * Gera relatórios comparativos em Markdown e CSV.
 */

import fs from 'fs';
import path from 'path';
import { AggregatedMetrics } from './metrics-aggregator';

export class ReportGenerator {
  /**
   * Gera tabela Markdown comparativa
   */
  generateMarkdownTable(metricsArray: AggregatedMetrics[]): string {
    const headers = [
      'Métrica',
      ...metricsArray.map(m => m.strategy.toUpperCase())
    ];

    const rows = [
      ['**Total de Evictions**', ...metricsArray.map(m => m.totalEvictions.toString())],
      ['**Duração Média (ms)**', ...metricsArray.map(m => m.avgDurationMs.toFixed(2))],
      ['**Duração Min (ms)**', ...metricsArray.map(m => m.minDurationMs.toString())],
      ['**Duração Max (ms)**', ...metricsArray.map(m => m.maxDurationMs.toString())],
      ['**Duração P50 (ms)**', ...metricsArray.map(m => m.p50DurationMs.toString())],
      ['**Duração P95 (ms)**', ...metricsArray.map(m => m.p95DurationMs.toString())],
      ['**Duração P99 (ms)**', ...metricsArray.map(m => m.p99DurationMs.toString())],
      ['**Entries Evictadas (média)**', ...metricsArray.map(m => m.avgEntriesEvicted.toFixed(2))],
      ['**Total Entries Evictadas**', ...metricsArray.map(m => m.totalEntriesEvicted.toString())],
      ['**Score Médio**', ...metricsArray.map(m => m.avgScoreBefore.toFixed(4))],
      ['**Utilização Antes (%)**', ...metricsArray.map(m => m.avgUtilizationBefore.toFixed(2) + '%')],
      ['**Utilização Depois (%)**', ...metricsArray.map(m => m.avgUtilizationAfter.toFixed(2) + '%')],
      ['**Eficiência (entries/ms)**', ...metricsArray.map(m => m.evictionEfficiency.toFixed(4))],
    ];

    let table = '| ' + headers.join(' | ') + ' |\n';
    table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    for (const row of rows) {
      table += '| ' + row.join(' | ') + ' |\n';
    }

    return table;
  }

  /**
   * Gera arquivo CSV
   */
  generateCSV(metricsArray: AggregatedMetrics[]): string {
    const headers = ['Metric', ...metricsArray.map(m => m.strategy)];

    const rows = [
      ['Total Evictions', ...metricsArray.map(m => m.totalEvictions)],
      ['Avg Duration (ms)', ...metricsArray.map(m => m.avgDurationMs)],
      ['Min Duration (ms)', ...metricsArray.map(m => m.minDurationMs)],
      ['Max Duration (ms)', ...metricsArray.map(m => m.maxDurationMs)],
      ['P50 Duration (ms)', ...metricsArray.map(m => m.p50DurationMs)],
      ['P95 Duration (ms)', ...metricsArray.map(m => m.p95DurationMs)],
      ['P99 Duration (ms)', ...metricsArray.map(m => m.p99DurationMs)],
      ['Avg Entries Evicted', ...metricsArray.map(m => m.avgEntriesEvicted)],
      ['Total Entries Evicted', ...metricsArray.map(m => m.totalEntriesEvicted)],
      ['Avg Score', ...metricsArray.map(m => m.avgScoreBefore)],
      ['Utilization Before (%)', ...metricsArray.map(m => m.avgUtilizationBefore)],
      ['Utilization After (%)', ...metricsArray.map(m => m.avgUtilizationAfter)],
      ['Efficiency (entries/ms)', ...metricsArray.map(m => m.evictionEfficiency)],
    ];

    let csv = headers.join(',') + '\n';
    for (const row of rows) {
      csv += row.join(',') + '\n';
    }

    return csv;
  }

  /**
   * Identifica a melhor estratégia baseado em critérios
   */
  rankStrategies(metricsArray: AggregatedMetrics[]): {
    fastestEviction: string;
    mostEfficient: string;
    bestUtilization: string;
  } {
    const sorted = {
      byDuration: [...metricsArray].sort((a, b) => a.avgDurationMs - b.avgDurationMs),
      byEfficiency: [...metricsArray].sort((a, b) => b.evictionEfficiency - a.evictionEfficiency),
      byUtilization: [...metricsArray].sort((a, b) => a.avgUtilizationAfter - b.avgUtilizationAfter),
    };

    return {
      fastestEviction: sorted.byDuration[0].strategy,
      mostEfficient: sorted.byEfficiency[0].strategy,
      bestUtilization: sorted.byUtilization[0].strategy,
    };
  }

  /**
   * Gera relatório completo
   */
  generateFullReport(metricsArray: AggregatedMetrics[], outputDir: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    // Markdown
    const markdown = this.generateMarkdownTable(metricsArray);
    const markdownPath = path.join(outputDir, `comparison-report-${timestamp}.md`);

    let fullMarkdown = `# Comparação de Estratégias de Eviction\n\n`;
    fullMarkdown += `**Data**: ${new Date().toISOString()}\n\n`;
    fullMarkdown += `## Métricas Comparativas\n\n`;
    fullMarkdown += markdown;
    fullMarkdown += `\n\n## Rankings\n\n`;

    const rankings = this.rankStrategies(metricsArray);
    fullMarkdown += `- 🏆 **Eviction Mais Rápida**: ${rankings.fastestEviction.toUpperCase()}\n`;
    fullMarkdown += `- 🏆 **Mais Eficiente**: ${rankings.mostEfficient.toUpperCase()}\n`;
    fullMarkdown += `- 🏆 **Melhor Utilização**: ${rankings.bestUtilization.toUpperCase()}\n`;
    fullMarkdown += `\n---\n\n`;
    fullMarkdown += `*Gerado automaticamente pela ferramenta DAAP Strategy Comparison*\n`;

    fs.writeFileSync(markdownPath, fullMarkdown);
    console.log(`✅ Markdown report: ${markdownPath}`);

    // CSV
    const csv = this.generateCSV(metricsArray);
    const csvPath = path.join(outputDir, `comparison-report-${timestamp}.csv`);
    fs.writeFileSync(csvPath, csv);
    console.log(`✅ CSV report: ${csvPath}`);
  }
}

export default ReportGenerator;
