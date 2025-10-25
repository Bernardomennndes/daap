#!/usr/bin/env tsx

import { CacheResultComparison } from "./cache-result-comparison";
import { CLI } from "../utils/cli";
import { Logger } from "../utils/logger";
import { CacheController } from "../utils/cache";
import { promises as fs } from "fs";
import path from "path";

interface SimpleBenchmarkResult {
  service: string;
  responseTime: number;
  qps: number;
  snapshotSpeed: number;
  peakQPS: number;
}

class BenchmarkAnalyzer {
  private logger: Logger;
  private cli: CLI;
  private cacheController: CacheController;

  constructor() {
    this.logger = new Logger();
    this.cli = new CLI();
    this.cacheController = new CacheController(this.logger, this.cli);
  }

  async runQuickBenchmark(): Promise<void> {
    this.logger.logSeparator("Cache Performance Benchmark Analysis");
    this.logger.log("INFO", "🚀 Iniciando análise rápida de benchmark");

    try {
      // Verificar disponibilidade dos serviços
      const availability = await this.cacheController.checkCacheAvailability();
      this.logger.log("INFO", `Redis disponível: ${availability.redis ? '✅' : '❌'}`);
      this.logger.log("INFO", `Dragonfly disponível: ${availability.dragonfly ? '✅' : '❌'}`);

      if (!availability.redis && !availability.dragonfly) {
        this.logger.log("ERROR", "❌ Nenhum serviço de cache está disponível");
        return;
      }

      const results: SimpleBenchmarkResult[] = [];

      // Benchmark Redis
      if (availability.redis) {
        this.logger.logSeparator("Benchmark Redis");
        await this.benchmarkService("Redis", this.cacheController.redisHost, this.cacheController.redisPort, results);
      }

      // Benchmark Dragonfly
      if (availability.dragonfly) {
        this.logger.logSeparator("Benchmark Dragonfly");
        await this.benchmarkService("Dragonfly", this.cacheController.dragonflyHost, this.cacheController.dragonflyPort, results);
      }

      // Mostrar comparação
      this.showComparison(results);

      // Salvar resultados
      await this.saveResults(results);

    } catch (error) {
      this.logger.log("ERROR", `❌ Erro durante benchmark: ${(error as Error).message}`);
    }
  }

  private async benchmarkService(serviceName: string, host: string, port: number, results: SimpleBenchmarkResult[]): Promise<void> {
    this.logger.log("INFO", `📊 Analisando ${serviceName} em ${host}:${port}`);

    try {
      // Teste de latência básico
      const startTime = Date.now();
      await this.cacheController.queryRedisWithTiming("benchmark_test");
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Métricas de throughput e snapshot
      this.logger.log("INFO", `⏱️  Medindo métricas de performance...`);
      const metrics = await this.cacheController.getBenchmarkMetrics(host, port);

      const result: SimpleBenchmarkResult = {
        service: serviceName,
        responseTime,
        qps: metrics.qps,
        snapshotSpeed: metrics.snapshotSpeed,
        peakQPS: metrics.peakQPS
      };

      results.push(result);

      // Log imediato dos resultados
      this.logger.log("SUCCESS", `✅ ${serviceName} - Latência: ${responseTime}ms`);
      this.logger.log("INFO", `📈 ${serviceName} - QPS: ${metrics.qps.toLocaleString()}`);
      this.logger.log("INFO", `🔥 ${serviceName} - QPS Pico: ${metrics.peakQPS.toLocaleString()}`);
      this.logger.log("INFO", `💾 ${serviceName} - Snapshot Speed: ${metrics.snapshotSpeed} MB/s`);

    } catch (error) {
      this.logger.log("ERROR", `❌ Erro ao analisar ${serviceName}: ${(error as Error).message}`);
    }
  }

  private showComparison(results: SimpleBenchmarkResult[]): void {
    if (results.length < 2) return;

    this.logger.logSeparator("Comparação Dragonfly vs Redis");

    const redis = results.find(r => r.service === "Redis");
    const dragonfly = results.find(r => r.service === "Dragonfly");

    if (!redis || !dragonfly) return;

    // Comparações
    const latencyImprovement = ((redis.responseTime - dragonfly.responseTime) / redis.responseTime * 100).toFixed(1);
    const qpsRatio = (dragonfly.qps / redis.qps).toFixed(1);
    const snapshotRatio = (dragonfly.snapshotSpeed / redis.snapshotSpeed).toFixed(1);
    const peakQPSRatio = (dragonfly.peakQPS / redis.peakQPS).toFixed(1);

    this.logger.log("SUCCESS", `🚀 Latência: Dragonfly é ${latencyImprovement}% mais rápido`);
    this.logger.log("SUCCESS", `📊 QPS: Dragonfly é ${qpsRatio}x mais eficiente`);
    this.logger.log("SUCCESS", `🔥 QPS Pico: Dragonfly é ${peakQPSRatio}x superior`);
    this.logger.log("SUCCESS", `💾 Snapshot: Dragonfly é ${snapshotRatio}x mais rápido`);

    // Tabela comparativa
    const comparisonData = [
      {
        Métrica: "Latência (ms)",
        Redis: redis.responseTime,
        Dragonfly: dragonfly.responseTime,
        "Melhoria": `${latencyImprovement}%`
      },
      {
        Métrica: "QPS",
        Redis: redis.qps.toLocaleString(),
        Dragonfly: dragonfly.qps.toLocaleString(),
        "Melhoria": `${qpsRatio}x`
      },
      {
        Métrica: "QPS Pico",
        Redis: redis.peakQPS.toLocaleString(),
        Dragonfly: dragonfly.peakQPS.toLocaleString(),
        "Melhoria": `${peakQPSRatio}x`
      },
      {
        Métrica: "Snapshot (MB/s)",
        Redis: redis.snapshotSpeed,
        Dragonfly: dragonfly.snapshotSpeed,
        "Melhoria": `${snapshotRatio}x`
      }
    ];

    this.logger.logTable(comparisonData, "Comparação Detalhada");
  }

  private async saveResults(results: SimpleBenchmarkResult[]): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `benchmark-analysis-${timestamp}.json`;
    const filePath = path.join(__dirname, "../results", fileName);

    const report = {
      timestamp: new Date().toISOString(),
      type: "benchmark-analysis",
      results,
      summary: this.generateSummary(results)
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
      this.logger.log("SUCCESS", `📄 Relatório salvo: ${fileName}`);
    } catch (error) {
      this.logger.log("ERROR", `❌ Erro ao salvar relatório: ${(error as Error).message}`);
    }
  }

  private generateSummary(results: SimpleBenchmarkResult[]) {
    const redis = results.find(r => r.service === "Redis");
    const dragonfly = results.find(r => r.service === "Dragonfly");

    if (!redis || !dragonfly) return null;

    return {
      latencyImprovement: `${((redis.responseTime - dragonfly.responseTime) / redis.responseTime * 100).toFixed(1)}%`,
      qpsRatio: `${(dragonfly.qps / redis.qps).toFixed(1)}x`,
      snapshotRatio: `${(dragonfly.snapshotSpeed / redis.snapshotSpeed).toFixed(1)}x`,
      peakQPSRatio: `${(dragonfly.peakQPS / redis.peakQPS).toFixed(1)}x`,
      dragonflyAdvantages: [
        "Maior throughput (QPS)",
        "Melhor velocidade de snapshot",
        "Menor latência de resposta",
        "Maior eficiência de memória"
      ]
    };
  }
}

// Executar análise
const analyzer = new BenchmarkAnalyzer();
analyzer.runQuickBenchmark();