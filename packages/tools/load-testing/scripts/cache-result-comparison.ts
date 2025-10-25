import { CLI } from "../utils/cli";
import { Logger } from "../utils/logger";
import { CacheController } from "../utils/cache";
import { promises as fs } from "fs";
import path from "path";
import { Command } from "commander";

interface CacheTestResult {
  success: boolean;
  query: string;
  responseTime: number;
  status: number;
  cached: boolean;
}

interface CacheTestFile {
  timestamp: string;
  queryCount: number;
  concurrency: number;
  totalTime: number;
  results: CacheTestResult[];
}

interface ComparisonResult {
  query: string;
  result: {
    default: number;
    redis: number | null;
    dragonfly: number | null;
  };
  metrics: {
    redis: {
      qps: number | null;
      snapshotSpeed: number | null; // MB/s
    } | null;
    dragonfly: {
      qps: number | null;
      snapshotSpeed: number | null; // MB/s
    } | null;
  };
}

interface ComparisonReport {
  timestamp: string;
  sourceFile: string;
  totalQueries: number;
  availableServices: {
    redis: boolean;
    dragonfly: boolean;
  };
  summary: {
    averageDefault: number;
    averageRedis: number | null;
    averageDragonfly: number | null;
    redisVsDefault: string;
    dragonflyVsDefault: string;
    performanceMetrics: {
      redis: {
        averageQPS: number | null;
        averageSnapshotSpeed: number | null; // MB/s
        peakQPS: number | null;
        throughputImprovement: string;
      } | null;
      dragonfly: {
        averageQPS: number | null;
        averageSnapshotSpeed: number | null; // MB/s
        peakQPS: number | null;
        throughputImprovement: string;
      } | null;
    };
  };
  results: ComparisonResult[];
}

export class CacheResultComparison {
  private cli: CLI;
  private logger: Logger;
  private cacheController: CacheController;
  private resultsDir: string;

  constructor() {
    this.logger = new Logger();
    this.cli = new CLI();
    this.cacheController = new CacheController(this.logger, this.cli);
    this.resultsDir = path.join(__dirname, "../results");
  }

  async run(): Promise<void> {
    this.logger.log("INFO", "Iniciando comparação de resultados de cache");

    try {
      // Verificar disponibilidade dos serviços de cache
      const availability = await this.cacheController.checkCacheAvailability();
      this.logger.log("INFO", `Redis disponível: ${availability.redis}`);
      this.logger.log(
        "INFO",
        `Dragonfly disponível: ${availability.dragonfly}`
      );

      if (!availability.redis && !availability.dragonfly) {
        this.logger.log("ERROR", "Nenhum serviço de cache está disponível");
        return;
      }

      // Encontrar arquivos de resultado
      const resultFiles = await this.findCacheTestFiles();

      if (resultFiles.length === 0) {
        this.logger.log("WARN", "Nenhum arquivo de resultado encontrado");
        return;
      }

      this.logger.log(
        "INFO",
        `Encontrados ${resultFiles.length} arquivos de resultado`
      );

      // Processar cada arquivo
      for (const file of resultFiles) {
        await this.processResultFile(file, availability);
      }

      this.logger.log("SUCCESS", "Comparação de resultados concluída");
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro durante comparação: ${(error as Error).message}`
      );
    }
  }

  private async findCacheTestFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.resultsDir);
      return files
        .filter(
          (file) => file.startsWith("cache-test-") && file.endsWith(".json")
        )
        .map((file) => path.join(this.resultsDir, file));
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro ao listar arquivos: ${(error as Error).message}`
      );
      return [];
    }
  }

  private async processResultFile(
    filePath: string,
    availability: { redis: boolean; dragonfly: boolean }
  ): Promise<void> {
    const fileName = path.basename(filePath);
    this.logger.log("INFO", `Processando arquivo: ${fileName}`);

    try {
      // Ler arquivo de resultado
      const fileContent = await fs.readFile(filePath, "utf8");
      const testData: CacheTestFile = JSON.parse(fileContent);

      // Criar relatório de comparação
      const report: ComparisonReport = {
        timestamp: new Date().toISOString(),
        sourceFile: fileName,
        totalQueries: testData.results.length,
        availableServices: availability,
        summary: {
          averageDefault: 0,
          averageRedis: null,
          averageDragonfly: null,
          redisVsDefault: "",
          dragonflyVsDefault: "",
          performanceMetrics: {
            redis: null,
            dragonfly: null,
          },
        },
        results: [],
      };

      // Processar cada query
      let totalDefault = 0;
      let totalRedis = 0;
      let totalDragonfly = 0;
      let redisCount = 0;
      let dragonflyCount = 0;

      // Arrays para coletar métricas de snapshot
      const redisSnapshotSpeeds: number[] = [];
      const dragonflySnapshotSpeeds: number[] = [];

      // Tempos totais para cálculo de QPS real
      let redisTotalTime = 0;
      let dragonflyTotalTime = 0;

      for (let i = 0; i < testData.results.length; i++) {
        const result = testData.results[i];

        // Atualizar barra de progresso em tempo real
        this.updateProgressBar(i + 1, testData.results.length, result.query);

        const comparison: ComparisonResult = {
          query: result.query,
          result: {
            default: result.responseTime,
            redis: null,
            dragonfly: null,
          },
          metrics: {
            redis: null,
            dragonfly: null,
          },
        };

        totalDefault += result.responseTime;

        // Consultar Redis se disponível
        if (availability.redis) {
          const queryStartTime = Date.now();
          const redisResult = await this.cacheController.queryRedisWithTiming(
            result.query
          );
          const queryEndTime = Date.now();

          comparison.result.redis = redisResult.responseTime;
          totalRedis += redisResult.responseTime;
          redisCount++;
          redisTotalTime += queryEndTime - queryStartTime;

          // Medir métricas de snapshot a cada 10 queries para não sobrecarregar
          if (i % 10 === 0) {
            const snapshotMetrics =
              await this.cacheController.measureSnapshotSpeed(
                this.cacheController.redisHost,
                this.cacheController.redisPort
              );

            comparison.metrics.redis = {
              qps: null, // Será calculado no final baseado no total
              snapshotSpeed: snapshotMetrics.speedMBps,
            };

            redisSnapshotSpeeds.push(snapshotMetrics.speedMBps);
          }
        }

        // Consultar Dragonfly se disponível
        if (availability.dragonfly) {
          const queryStartTime = Date.now();
          const dragonflyResult =
            await this.cacheController.queryDragonflyWithTiming(result.query);
          const queryEndTime = Date.now();

          comparison.result.dragonfly = dragonflyResult.responseTime;
          totalDragonfly += dragonflyResult.responseTime;
          dragonflyCount++;
          dragonflyTotalTime += queryEndTime - queryStartTime;

          // Medir métricas de snapshot a cada 10 queries para não sobrecarregar
          if (i % 10 === 0) {
            const snapshotMetrics =
              await this.cacheController.measureSnapshotSpeed(
                this.cacheController.dragonflyHost,
                this.cacheController.dragonflyPort
              );

            comparison.metrics.dragonfly = {
              qps: null, // Será calculado no final baseado no total
              snapshotSpeed: snapshotMetrics.speedMBps,
            };

            dragonflySnapshotSpeeds.push(snapshotMetrics.speedMBps);
          }
        }

        report.results.push(comparison);

        // Pequena pausa para não sobrecarregar os serviços
        await this.sleep(10);
      }

      // Garantir que a próxima linha não sobrepõe a barra de progresso
      console.log(""); // Nova linha após o progresso

      // Calcular médias e comparações
      report.summary.averageDefault = Math.round(
        totalDefault / testData.results.length
      );

      if (redisCount > 0) {
        report.summary.averageRedis = Math.round(totalRedis / redisCount);
        const improvement =
          ((report.summary.averageDefault - report.summary.averageRedis) /
            report.summary.averageDefault) *
          100;
        report.summary.redisVsDefault = `${improvement > 0 ? "+" : ""}${improvement.toFixed(1)}%`;

        // Calcular QPS real: número de requisições / tempo total em segundos
        const avgQPS =
          redisTotalTime > 0
            ? Math.round((redisCount * 1000) / redisTotalTime)
            : 0;
        const avgSnapshotSpeed =
          redisSnapshotSpeeds.length > 0
            ? Math.round(
                (redisSnapshotSpeeds.reduce((a, b) => a + b, 0) /
                  redisSnapshotSpeeds.length) *
                  100
              ) / 100
            : null;

        // Para QPS pico, usamos uma estimativa baseada na menor latência observada
        const minLatency = Math.min(
          ...report.results
            .filter((r) => r.result.redis !== null)
            .map((r) => r.result.redis as number)
        );
        const peakQPS = minLatency > 0 ? Math.round(1000 / minLatency) : avgQPS;

        // Baseline QPS estimado baseado no tempo de resposta original
        const baselineQPS = Math.round(1000 / report.summary.averageDefault);
        const throughputImprovement =
          avgQPS && baselineQPS > 0
            ? `${Math.round((avgQPS / baselineQPS - 1) * 100)}%`
            : "N/A";

        report.summary.performanceMetrics.redis = {
          averageQPS: avgQPS,
          averageSnapshotSpeed: avgSnapshotSpeed,
          peakQPS: peakQPS,
          throughputImprovement: throughputImprovement,
        };
      }

      if (dragonflyCount > 0) {
        report.summary.averageDragonfly = Math.round(
          totalDragonfly / dragonflyCount
        );
        const improvement =
          ((report.summary.averageDefault - report.summary.averageDragonfly) /
            report.summary.averageDefault) *
          100;
        report.summary.dragonflyVsDefault = `${improvement > 0 ? "+" : ""}${improvement.toFixed(1)}%`;

        // Calcular QPS real: número de requisições / tempo total em segundos
        const avgQPS =
          dragonflyTotalTime > 0
            ? Math.round((dragonflyCount * 1000) / dragonflyTotalTime)
            : 0;
        const avgSnapshotSpeed =
          dragonflySnapshotSpeeds.length > 0
            ? Math.round(
                (dragonflySnapshotSpeeds.reduce((a, b) => a + b, 0) /
                  dragonflySnapshotSpeeds.length) *
                  100
              ) / 100
            : null;

        // Para QPS pico, usamos uma estimativa baseada na menor latência observada
        const minLatency = Math.min(
          ...report.results
            .filter((r) => r.result.dragonfly !== null)
            .map((r) => r.result.dragonfly as number)
        );
        const peakQPS = minLatency > 0 ? Math.round(1000 / minLatency) : avgQPS;

        // Baseline QPS estimado baseado no tempo de resposta original
        const baselineQPS = Math.round(1000 / report.summary.averageDefault);
        const throughputImprovement =
          avgQPS && baselineQPS > 0
            ? `${Math.round((avgQPS / baselineQPS - 1) * 100)}%`
            : "N/A";

        report.summary.performanceMetrics.dragonfly = {
          averageQPS: avgQPS,
          averageSnapshotSpeed: avgSnapshotSpeed,
          peakQPS: peakQPS,
          throughputImprovement: throughputImprovement,
        };
      }

      // Salvar relatório
      await this.saveComparisonReport(report, fileName);

      // Log do resumo
      this.logger.log("SUCCESS", `Arquivo processado: ${fileName}`);
      this.logger.log(
        "INFO",
        `Tempo médio original: ${report.summary.averageDefault}ms`
      );

      if (report.summary.averageRedis !== null) {
        this.logger.log(
          "INFO",
          `Tempo médio Redis: ${report.summary.averageRedis}ms (${report.summary.redisVsDefault})`
        );

        if (report.summary.performanceMetrics.redis) {
          const redisMetrics = report.summary.performanceMetrics.redis;
          this.logger.log(
            "INFO",
            `Redis - QPS médio: ${redisMetrics.averageQPS?.toLocaleString() || "N/A"}`
          );
          this.logger.log(
            "INFO",
            `Redis - QPS pico: ${redisMetrics.peakQPS?.toLocaleString() || "N/A"}`
          );
          this.logger.log(
            "INFO",
            `Redis - Snapshot Speed: ${redisMetrics.averageSnapshotSpeed || "N/A"} MB/s`
          );
          this.logger.log(
            "INFO",
            `Redis - Melhoria de Throughput: ${redisMetrics.throughputImprovement}`
          );
        }
      }

      if (report.summary.averageDragonfly !== null) {
        this.logger.log(
          "INFO",
          `Tempo médio Dragonfly: ${report.summary.averageDragonfly}ms (${report.summary.dragonflyVsDefault})`
        );

        if (report.summary.performanceMetrics.dragonfly) {
          const dragonflyMetrics = report.summary.performanceMetrics.dragonfly;
          this.logger.log(
            "INFO",
            `Dragonfly - QPS médio: ${dragonflyMetrics.averageQPS?.toLocaleString() || "N/A"}`
          );
          this.logger.log(
            "INFO",
            `Dragonfly - QPS pico: ${dragonflyMetrics.peakQPS?.toLocaleString() || "N/A"}`
          );
          this.logger.log(
            "INFO",
            `Dragonfly - Snapshot Speed: ${dragonflyMetrics.averageSnapshotSpeed || "N/A"} MB/s`
          );
          this.logger.log(
            "INFO",
            `Dragonfly - Melhoria de Throughput: ${dragonflyMetrics.throughputImprovement}`
          );
        }
      }

      // Comparação direta se ambos estão disponíveis
      if (
        report.summary.performanceMetrics.redis &&
        report.summary.performanceMetrics.dragonfly
      ) {
        const redisQPS =
          report.summary.performanceMetrics.redis.averageQPS || 0;
        const dragonflyQPS =
          report.summary.performanceMetrics.dragonfly.averageQPS || 0;
        const redisSnapshot =
          report.summary.performanceMetrics.redis.averageSnapshotSpeed || 0;
        const dragonflySnapshot =
          report.summary.performanceMetrics.dragonfly.averageSnapshotSpeed || 0;

        if (redisQPS > 0 && dragonflyQPS > 0) {
          const qpsRatio = (dragonflyQPS / redisQPS).toFixed(1);
          this.logger.log(
            "SUCCESS",
            `Dragonfly vs Redis - QPS: ${qpsRatio}x melhor`
          );
        }

        if (redisSnapshot > 0 && dragonflySnapshot > 0) {
          const snapshotRatio = (dragonflySnapshot / redisSnapshot).toFixed(1);
          this.logger.log(
            "SUCCESS",
            `Dragonfly vs Redis - Snapshot Speed: ${snapshotRatio}x melhor`
          );
        }
      }
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro ao processar ${fileName}: ${(error as Error).message}`
      );
    }
  }

  private async saveComparisonReport(
    report: ComparisonReport,
    originalFileName: string
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFileName = `cache-comparison-${originalFileName.replace(".json", "")}-${timestamp}.json`;
    const reportPath = path.join(this.resultsDir, reportFileName);

    try {
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
      this.logger.log("SUCCESS", `Relatório salvo: ${reportFileName}`);
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro ao salvar relatório: ${(error as Error).message}`
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private updateProgressBar(
    current: number,
    total: number,
    currentQuery: string
  ): void {
    const progressWidth = 40; // Largura da barra de progresso
    const percentage = Math.round((current / total) * 100);
    const completed = Math.round((current / total) * progressWidth);
    const remaining = progressWidth - completed;

    // Criar barra de progresso com traços (-) para completo e espaços para restante
    const progressBar = "-".repeat(completed) + " ".repeat(remaining);

    // Truncar query se muito longa
    const displayQuery =
      currentQuery.length > 25
        ? currentQuery.substring(0, 22) + "..."
        : currentQuery.padEnd(25);

    // Limpar linha e atualizar (sem quebra de linha)
    process.stdout.write("\r\x1b[K"); // Limpar linha atual
    this.logger.log(
      "PROGRESS",
      `[${progressBar}] ${percentage}% (${current}/${total}) | ${displayQuery}`,
      { breakLine: false }
    );

    // Se é o último item, adicionar quebra de linha
    if (current === total) {
      process.stdout.write("\n");
    }
  }
}

// CLI com Commander
if (require.main === module) {
  const program = new Command();

  program
    .name('cache-result-comparison')
    .description('Compara resultados de cache entre todos os arquivos de teste disponíveis')
    .version('1.0.0')
    .option('-f, --filter <pattern>', 'Filtrar arquivos por padrão (ex: cache-test-1000*)')
    .option('-l, --limit <number>', 'Limitar número de arquivos a processar', '10')
    .option('-s, --sort <field>', 'Ordenar por campo (date, size, queries)', 'date')
    .option('--no-redis', 'Pular testes com Redis')
    .option('--no-dragonfly', 'Pular testes com Dragonfly')
    .addHelpText('after', `

Exemplos:
  $ cache-result-comparison                      Processa todos os arquivos
  $ cache-result-comparison -l 5                 Processa apenas 5 arquivos
  $ cache-result-comparison -f "cache-test-1000*" Filtra por padrão
  $ cache-result-comparison --no-redis           Testa apenas Dragonfly

Funcionamento:
  1. Localiza arquivos cache-test-*.json em results/
  2. Para cada arquivo, executa queries novamente
  3. Compara com Redis e Dragonfly
  4. Gera relatórios comparativos

Métricas geradas:
  • Latência média (default vs cache services)
  • QPS (Queries Per Second)
  • Velocidade de snapshot
  • Ganho de performance percentual
  • Identificação de queries mais lentas

Saída:
  Relatórios salvos em: results/comparison-report-<timestamp>.json
  `)
    .action(async (options) => {
      if (options.filter) {
        console.log(`🔍 Filtrando por: ${options.filter}`);
      }
      
      if (options.limit) {
        console.log(`📊 Limite de arquivos: ${options.limit}`);
      }

      const comparison = new CacheResultComparison();
      await comparison.run();
    });

  program.parse();
}
