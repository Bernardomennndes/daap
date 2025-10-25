#!/usr/bin/env tsx

import { Command } from "commander";
import { promises as fs } from "fs";
import path from "path";
import { Logger } from "../utils/logger";

interface CacheTestResult {
  timestamp: string;
  queryCount: number;
  concurrency: number;
  totalTime: number;
  results: Array<{
    success: boolean;
    query: string;
    responseTime: number;
    status: number;
    cached: boolean;
  }>;
}

interface KeywordStats {
  keyword: string;
  count: number;
  percentage: number;
  averageResponseTime: number;
  totalQueries: number;
  cacheHitRate: number;
}

interface KeywordAnalysisReport {
  timestamp: string;
  totalQueriesAnalyzed: number;
  totalUniqueKeywords: number;
  filesAnalyzed: string[];
  keywordStats: KeywordStats[];
  topKeywords: {
    top10: KeywordStats[];
    top25: KeywordStats[];
    top50: KeywordStats[];
  };
  insights: {
    mostUsedKeyword: KeywordStats | null;
    leastUsedKeyword: KeywordStats | null;
    averageKeywordsPerQuery: number;
    keywordsWithHighCacheHit: KeywordStats[];
    keywordsWithLowCacheHit: KeywordStats[];
  };
}

class KeywordAnalyzer {
  private logger: Logger;
  private resultsDir: string;
  private keywordMap: Map<string, {
    count: number;
    responseTimes: number[];
    queries: Set<string>;
    cachedQueries: number;
  }>;

  constructor() {
    this.logger = new Logger();
    this.resultsDir = path.join(__dirname, "../results");
    this.keywordMap = new Map();
  }

  /**
   * Analisa todos os arquivos cache-test-*.json
   */
  async analyzeAllCacheTests(): Promise<void> {
    this.logger.logSeparator("Keyword Analysis - Cache Tests");
    this.logger.log("INFO", "🔍 Iniciando análise de keywords nas queries de cache");

    try {
      // Listar todos os arquivos cache-test-*.json
      const files = await this.getCacheTestFiles();
      
      if (files.length === 0) {
        this.logger.log("WARN", "⚠️  Nenhum arquivo cache-test-*.json encontrado");
        return;
      }

      this.logger.log("INFO", `📁 Encontrados ${files.length} arquivo(s) de teste de cache`);

      let totalQueries = 0;

      // Processar cada arquivo
      for (const file of files) {
        this.logger.log("INFO", `📊 Processando: ${path.basename(file)}`);
        const queries = await this.processFile(file);
        totalQueries += queries;
      }

      this.logger.log("SUCCESS", `✅ Total de queries processadas: ${totalQueries.toLocaleString()}`);

      // Gerar relatório
      const report = this.generateReport(files, totalQueries);

      // Salvar relatório
      await this.saveReport(report, undefined);

      // Mostrar resumo
      this.displaySummary(report);

    } catch (error) {
      this.logger.log("ERROR", `❌ Erro durante análise: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Analisa um arquivo específico de teste de cache
   */
  async analyzeSingleFile(filePath: string): Promise<void> {
    this.logger.logSeparator("Keyword Analysis - Single File");
    this.logger.log("INFO", "🔍 Iniciando análise de keywords em arquivo específico");

    try {
      // Verificar se o arquivo existe
      let fullPath = filePath;
      
      // Se não for caminho absoluto, tentar localizar no diretório de resultados
      if (!path.isAbsolute(filePath)) {
        // Verificar se é apenas o nome do arquivo
        if (!filePath.includes('/')) {
          fullPath = path.join(this.resultsDir, filePath);
        } else {
          fullPath = path.resolve(filePath);
        }
      }

      try {
        await fs.access(fullPath);
      } catch {
        this.logger.log("ERROR", `❌ Arquivo não encontrado: ${filePath}`);
        this.logger.log("INFO", `💡 Tentativa de caminho: ${fullPath}`);
        return;
      }

      this.logger.log("INFO", `📁 Analisando arquivo: ${path.basename(fullPath)}`);

      // Processar o arquivo
      const totalQueries = await this.processFile(fullPath);

      if (totalQueries === 0) {
        this.logger.log("WARN", "⚠️  Nenhuma query encontrada no arquivo");
        return;
      }

      this.logger.log("SUCCESS", `✅ Total de queries processadas: ${totalQueries.toLocaleString()}`);

      // Gerar relatório
      const report = this.generateReport([fullPath], totalQueries);

      // Salvar relatório
      await this.saveReport(report, path.basename(fullPath, '.json'));

      // Mostrar resumo
      this.displaySummary(report);

    } catch (error) {
      this.logger.log("ERROR", `❌ Erro durante análise: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Obtém lista de arquivos cache-test-*.json
   */
  private async getCacheTestFiles(): Promise<string[]> {
    const files = await fs.readdir(this.resultsDir);
    return files
      .filter(file => file.startsWith("cache-test-") && file.endsWith(".json"))
      .map(file => path.join(this.resultsDir, file))
      .sort();
  }

  /**
   * Processa um arquivo de teste de cache
   */
  private async processFile(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data: CacheTestResult = JSON.parse(content);

      if (!data.results || !Array.isArray(data.results)) {
        this.logger.log("WARN", `⚠️  Arquivo ${path.basename(filePath)} não contém resultados válidos`);
        return 0;
      }

      // Processar cada query
      for (const result of data.results) {
        if (result.query) {
          this.processQuery(result.query, result.responseTime, result.cached);
        }
      }

      return data.results.length;
    } catch (error) {
      this.logger.log("ERROR", `❌ Erro ao processar ${path.basename(filePath)}: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Processa uma query individual e extrai keywords
   */
  private processQuery(query: string, responseTime: number, cached: boolean): void {
    // Normalizar a query: lowercase e dividir por espaços
    const keywords = query.toLowerCase().trim().split(/\s+/);

    for (const keyword of keywords) {
      if (!keyword) continue;

      if (!this.keywordMap.has(keyword)) {
        this.keywordMap.set(keyword, {
          count: 0,
          responseTimes: [],
          queries: new Set(),
          cachedQueries: 0,
        });
      }

      const stats = this.keywordMap.get(keyword)!;
      stats.count++;
      stats.responseTimes.push(responseTime);
      stats.queries.add(query);
      if (cached) {
        stats.cachedQueries++;
      }
    }
  }

  /**
   * Gera relatório de análise
   */
  private generateReport(files: string[], totalQueries: number): KeywordAnalysisReport {
    const keywordStats: KeywordStats[] = [];
    let totalKeywordOccurrences = 0;

    // Calcular estatísticas para cada keyword
    for (const [keyword, stats] of this.keywordMap.entries()) {
      const avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
      const cacheHitRate = (stats.cachedQueries / stats.queries.size) * 100;

      keywordStats.push({
        keyword,
        count: stats.count,
        percentage: 0, // Será calculado depois
        averageResponseTime: Math.round(avgResponseTime * 100) / 100,
        totalQueries: stats.queries.size,
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      });

      totalKeywordOccurrences += stats.count;
    }

    // Calcular percentagens
    for (const stat of keywordStats) {
      stat.percentage = Math.round((stat.count / totalKeywordOccurrences) * 10000) / 100;
    }

    // Ordenar por contagem (decrescente)
    keywordStats.sort((a, b) => b.count - a.count);

    // Gerar insights
    const insights = this.generateInsights(keywordStats, totalQueries);

    return {
      timestamp: new Date().toISOString(),
      totalQueriesAnalyzed: totalQueries,
      totalUniqueKeywords: keywordStats.length,
      filesAnalyzed: files.map(f => path.basename(f)),
      keywordStats,
      topKeywords: {
        top10: keywordStats.slice(0, 10),
        top25: keywordStats.slice(0, 25),
        top50: keywordStats.slice(0, 50),
      },
      insights,
    };
  }

  /**
   * Gera insights a partir das estatísticas
   */
  private generateInsights(keywordStats: KeywordStats[], totalQueries: number): KeywordAnalysisReport["insights"] {
    if (keywordStats.length === 0) {
      return {
        mostUsedKeyword: null,
        leastUsedKeyword: null,
        averageKeywordsPerQuery: 0,
        keywordsWithHighCacheHit: [],
        keywordsWithLowCacheHit: [],
      };
    }

    // Keywords com alta taxa de cache hit (>= 90%)
    const highCacheHit = keywordStats
      .filter(k => k.cacheHitRate >= 90)
      .slice(0, 20);

    // Keywords com baixa taxa de cache hit (< 50%)
    const lowCacheHit = keywordStats
      .filter(k => k.cacheHitRate < 50)
      .sort((a, b) => a.cacheHitRate - b.cacheHitRate)
      .slice(0, 20);

    // Calcular média de keywords por query
    const totalKeywordOccurrences = keywordStats.reduce((sum, k) => sum + k.count, 0);
    const avgKeywordsPerQuery = totalKeywordOccurrences / totalQueries;

    return {
      mostUsedKeyword: keywordStats[0] || null,
      leastUsedKeyword: keywordStats[keywordStats.length - 1] || null,
      averageKeywordsPerQuery: Math.round(avgKeywordsPerQuery * 100) / 100,
      keywordsWithHighCacheHit: highCacheHit,
      keywordsWithLowCacheHit: lowCacheHit,
    };
  }

  /**
   * Salva o relatório em arquivo JSON
   */
  private async saveReport(report: KeywordAnalysisReport, prefix?: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-");
    const baseFilename = prefix ? `keyword-analysis-${prefix}-${timestamp}` : `keyword-analysis-${timestamp}`;
    const filename = `${baseFilename}.json`;
    const filepath = path.join(this.resultsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(report, null, 2), "utf-8");
    
    this.logger.log("SUCCESS", `✅ Relatório salvo: ${filename}`);

    // Salvar também um arquivo CSV simplificado
    await this.saveCSVReport(report, baseFilename);
  }

  /**
   * Salva um relatório CSV simplificado
   */
  private async saveCSVReport(report: KeywordAnalysisReport, baseFilename: string): Promise<void> {
    const filename = `${baseFilename}.csv`;
    const filepath = path.join(this.resultsDir, filename);

    const csvLines = [
      "Keyword,Count,Percentage,Avg Response Time (ms),Total Queries,Cache Hit Rate (%)",
    ];

    for (const stat of report.keywordStats) {
      csvLines.push(
        `"${stat.keyword}",${stat.count},${stat.percentage},${stat.averageResponseTime},${stat.totalQueries},${stat.cacheHitRate}`
      );
    }

    await fs.writeFile(filepath, csvLines.join("\n"), "utf-8");
    this.logger.log("SUCCESS", `✅ Relatório CSV salvo: ${filename}`);
  }

  /**
   * Exibe resumo no console
   */
  private displaySummary(report: KeywordAnalysisReport): void {
    this.logger.logSeparator("Resumo da Análise");

    this.logger.log("INFO", `📊 Total de queries analisadas: ${report.totalQueriesAnalyzed.toLocaleString()}`);
    this.logger.log("INFO", `🔤 Total de keywords únicas: ${report.totalUniqueKeywords.toLocaleString()}`);
    this.logger.log("INFO", `📈 Média de keywords por query: ${report.insights.averageKeywordsPerQuery}`);

    this.logger.logSeparator("Top 10 Keywords Mais Utilizadas");
    
    for (let i = 0; i < Math.min(10, report.topKeywords.top10.length); i++) {
      const keyword = report.topKeywords.top10[i];
      this.logger.log(
        "INFO",
        `${i + 1}. "${keyword.keyword}" - ${keyword.count.toLocaleString()} ocorrências (${keyword.percentage}%) - Cache Hit: ${keyword.cacheHitRate}%`
      );
    }

    if (report.insights.mostUsedKeyword) {
      this.logger.logSeparator("Insights");
      this.logger.log(
        "SUCCESS",
        `🥇 Keyword mais usada: "${report.insights.mostUsedKeyword.keyword}" com ${report.insights.mostUsedKeyword.count.toLocaleString()} ocorrências`
      );
      this.logger.log(
        "INFO",
        `⏱️  Tempo médio de resposta: ${report.insights.mostUsedKeyword.averageResponseTime}ms`
      );
      this.logger.log(
        "INFO",
        `📊 Taxa de cache hit: ${report.insights.mostUsedKeyword.cacheHitRate}%`
      );
    }

    this.logger.logSeparator("Keywords com Alta Taxa de Cache Hit (≥90%)");
    const topCacheHit = report.insights.keywordsWithHighCacheHit.slice(0, 5);
    for (const keyword of topCacheHit) {
      this.logger.log(
        "SUCCESS",
        `✅ "${keyword.keyword}" - ${keyword.cacheHitRate}% cache hit (${keyword.count} ocorrências)`
      );
    }

    this.logger.logSeparator("Keywords com Baixa Taxa de Cache Hit (<50%)");
    const lowCacheHit = report.insights.keywordsWithLowCacheHit.slice(0, 5);
    for (const keyword of lowCacheHit) {
      this.logger.log(
        "WARN",
        `⚠️  "${keyword.keyword}" - ${keyword.cacheHitRate}% cache hit (${keyword.count} ocorrências)`
      );
    }

    this.logger.logSeparator("Recomendações de Priorização");
    this.displayPrioritizationRecommendations(report);
  }

  /**
   * Exibe recomendações de priorização baseadas na análise
   */
  private displayPrioritizationRecommendations(report: KeywordAnalysisReport): void {
    // Prioridade ALTA: Top 20% de keywords mais usadas
    const highPriorityCount = Math.max(1, Math.ceil(report.totalUniqueKeywords * 0.2));
    const highPriority = report.keywordStats.slice(0, highPriorityCount);
    const highPriorityOccurrences = highPriority.reduce((sum, k) => sum + k.count, 0);
    const highPriorityPercentage = (highPriorityOccurrences / report.keywordStats.reduce((sum, k) => sum + k.count, 0)) * 100;

    this.logger.log(
      "SUCCESS",
      `🔥 PRIORIDADE ALTA: Top ${highPriorityCount} keywords (${Math.round(highPriorityPercentage)}% das ocorrências)`
    );
    this.logger.log("INFO", `   Essas keywords devem ter prioridade máxima em cache/persistência`);
    this.logger.log("INFO", `   Exemplos: ${highPriority.slice(0, 5).map(k => k.keyword).join(", ")}`);

    // Prioridade MÉDIA: 20% - 50%
    const mediumPriorityStart = highPriorityCount;
    const mediumPriorityEnd = Math.max(1, Math.ceil(report.totalUniqueKeywords * 0.5));
    const mediumPriority = report.keywordStats.slice(mediumPriorityStart, mediumPriorityEnd);
    
    if (mediumPriority.length > 0) {
      const mediumPriorityOccurrences = mediumPriority.reduce((sum, k) => sum + k.count, 0);
      const mediumPriorityPercentage = (mediumPriorityOccurrences / report.keywordStats.reduce((sum, k) => sum + k.count, 0)) * 100;

      this.logger.log(
        "INFO",
        `⚡ PRIORIDADE MÉDIA: ${mediumPriority.length} keywords (${Math.round(mediumPriorityPercentage)}% das ocorrências)`
      );
      this.logger.log("INFO", `   Essas keywords devem ter prioridade moderada`);
      this.logger.log("INFO", `   Exemplos: ${mediumPriority.slice(0, 5).map(k => k.keyword).join(", ")}`);
    }

    // Prioridade BAIXA: > 50%
    const lowPriority = report.keywordStats.slice(mediumPriorityEnd);
    
    if (lowPriority.length > 0) {
      const lowPriorityOccurrences = lowPriority.reduce((sum, k) => sum + k.count, 0);
      const lowPriorityPercentage = (lowPriorityOccurrences / report.keywordStats.reduce((sum, k) => sum + k.count, 0)) * 100;

      this.logger.log(
        "WARN",
        `💤 PRIORIDADE BAIXA: ${lowPriority.length} keywords (${Math.round(lowPriorityPercentage)}% das ocorrências)`
      );
      this.logger.log("INFO", `   Essas keywords podem ter menor prioridade em cache`);
      this.logger.log("INFO", `   Podem ser candidatas à evicção quando necessário`);
    }

    this.logger.logSeparator("");
    this.logger.log("INFO", "💡 Use esta análise para configurar políticas de cache baseadas em frequência");
    this.logger.log("INFO", "💡 Keywords de alta prioridade devem ter TTL maior e proteção contra evicção");
    this.logger.log("INFO", "💡 Considere implementar LFU (Least Frequently Used) para otimização");
  }
}

// CLI
const program = new Command();

program
  .name("keyword-analyzer")
  .description("Analisa keywords utilizadas nas queries dos testes de cache")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analisa todos os arquivos cache-test-*.json e gera relatório de keywords")
  .action(async () => {
    const analyzer = new KeywordAnalyzer();
    await analyzer.analyzeAllCacheTests();
  });

program
  .command("analyze-file <file>")
  .description("Analisa um arquivo específico de teste de cache")
  .action(async (file: string) => {
    const analyzer = new KeywordAnalyzer();
    await analyzer.analyzeSingleFile(file);
  });

program.parse(process.argv);

// Se nenhum comando for especificado, executa análise
if (!process.argv.slice(2).length) {
  const analyzer = new KeywordAnalyzer();
  analyzer.analyzeAllCacheTests().catch((error) => {
    console.error("Erro:", error.message);
    process.exit(1);
  });
}
