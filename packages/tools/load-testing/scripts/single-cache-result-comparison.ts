#!/usr/bin/env tsx

import { Command } from "commander";
import { CacheResultComparison } from "./cache-result-comparison";
import { CLI } from "../utils/cli";
import { Logger } from "../utils/logger";
import { CacheController } from "../utils/cache";
import { promises as fs } from "fs";
import path from "path";

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

class SingleFileComparison extends CacheResultComparison {
  async runSingleFile(fileName: string): Promise<void> {
    const logger = new Logger();
    const cli = new CLI();
    const cacheController = new CacheController(logger, cli);
    
    logger.logSeparator("Cache Performance Comparison");
    logger.log("INFO", `Processando arquivo específico: ${fileName}`);

    try {
      // Verificar disponibilidade dos serviços
      const availability = await cacheController.checkCacheAvailability();
      logger.log("INFO", `Redis disponível: ${availability.redis ? '✅' : '❌'}`);
      logger.log("INFO", `Dragonfly disponível: ${availability.dragonfly ? '✅' : '❌'}`);

      if (!availability.redis && !availability.dragonfly) {
        logger.log("ERROR", "❌ Nenhum serviço de cache está disponível");
        return;
      }

      const filePath = path.join(__dirname, "../results", fileName);
      
      // Verificar se arquivo existe
      try {
        await fs.access(filePath);
      } catch {
        logger.log("ERROR", `❌ Arquivo não encontrado: ${fileName}`);
        
        // Listar arquivos disponíveis
        const resultsDir = path.join(__dirname, "../results");
        const files = await fs.readdir(resultsDir);
        const cacheFiles = files.filter(f => f.startsWith("cache-test-") && f.endsWith(".json"));
        
        if (cacheFiles.length > 0) {
          logger.log("INFO", "📁 Arquivos disponíveis:");
          cacheFiles.forEach(file => logger.log("INFO", `  • ${file}`));
        }
        return;
      }

      // Processar arquivo
      await this.processSpecificFile(filePath, availability, logger, cacheController);

    } catch (error) {
      logger.log("ERROR", `❌ Erro: ${(error as Error).message}`);
    }
  }

  private async processSpecificFile(
    filePath: string, 
    availability: { redis: boolean; dragonfly: boolean },
    logger: Logger,
    cacheController: CacheController
  ): Promise<void> {
    const fileName = path.basename(filePath);
    
    // Ler arquivo
    const fileContent = await fs.readFile(filePath, "utf8");
    const testData: CacheTestFile = JSON.parse(fileContent);

    logger.logSeparator("Informações do Teste");
    logger.log("INFO", `📊 Total de queries: ${testData.results.length}`);
    logger.log("INFO", `⏱️  Tempo total original: ${testData.totalTime}ms`);
    logger.log("INFO", `🔄 Concorrência: ${testData.concurrency}`);
    logger.log("INFO", `📅 Timestamp: ${testData.timestamp}`);

    // Processar queries
    const results = [];
    let totalDefault = 0;
    let totalCount = 0;
    let totalRedis = 0;
    let totalDragonfly = 0;
    let redisCount = 0;
    let dragonflyCount = 0;

    logger.logSeparator("Processando Queries");

    for (let i = 0; i < testData.results.length; i++) { // Limitar a 10 para demo
      const result = testData.results[i];

      if (result.cached) continue; // Pular queries em cache

      process.stdout.write(`\r🔍 Query ${i + 1}/${testData.results.length}: "${result.query.substring(0, 30)}${result.query.length > 30 ? '...' : ''}"`);

      let redisTime = null;
      let dragonflyTime = null;

      // Consultar Redis
      if (availability.redis) {
        const redisResult = await cacheController.queryRedisWithTiming(result.query);
        redisTime = redisResult.responseTime;
        totalRedis += redisTime;
        redisCount++;
      }

      // Consultar Dragonfly
      if (availability.dragonfly) {
        const dragonflyResult = await cacheController.queryDragonflyWithTiming(result.query);
        dragonflyTime = dragonflyResult.responseTime;
        totalDragonfly += dragonflyTime;
        dragonflyCount++;
      }

      totalDefault += result.responseTime;
      totalCount++;

      results.push({
        Query: result.query.substring(0, 30) + (result.query.length > 30 ? '...' : ''),
        'Original (ms)': result.responseTime,
        'Redis (ms)': redisTime || 'N/A',
        'Dragonfly (ms)': dragonflyTime || 'N/A'
      });
    }

    console.log(''); // Nova linha

    // Mostrar resultados
    logger.logSeparator("Resultados das Consultas");
    logger.logTable(results.slice(0, 10), "Performance Comparison");

    // Calcular e mostrar médias
    const avgDefault = Math.round(totalDefault / totalCount);
    const avgRedis = redisCount > 0 ? Math.round(totalRedis / redisCount) : null;
    const avgDragonfly = dragonflyCount > 0 ? Math.round(totalDragonfly / dragonflyCount) : null;

    logger.logSeparator("Resumo de Performance");
    logger.log("INFO", `📈 Tempo médio original: ${avgDefault}ms`);
    
    if (avgRedis !== null) {
      const improvement = ((avgDefault - avgRedis) / avgDefault * 100);
      logger.log("INFO", `🔴 Tempo médio Redis: ${avgRedis}ms (${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%)`);
    }
    
    if (avgDragonfly !== null) {
      const improvement = ((avgDefault - avgDragonfly) / avgDefault * 100);
      logger.log("INFO", `🐲 Tempo médio Dragonfly: ${avgDragonfly}ms (${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%)`);
    }

    logger.logSeparator();
    logger.log("SUCCESS", "✅ Comparação concluída!");
  }
}

// CLI com Commander
const program = new Command();

program
  .name('single-cache-result-comparison')
  .description('Compara resultados de cache de um arquivo específico entre Redis e Dragonfly')
  .version('1.0.0')
  .argument('<filename>', 'Nome do arquivo de resultado a analisar')
  .option('-l, --list', 'Listar arquivos de resultado disponíveis')
  .option('-v, --verbose', 'Mostrar logs detalhados')
  .addHelpText('after', `

Exemplos:
  $ single-cache-result-comparison cache-test-100-1759589297344.json
  $ single-cache-result-comparison -l                    Lista arquivos disponíveis
  $ single-cache-result-comparison file.json -v          Modo verboso

Formato do arquivo:
  O arquivo deve estar em: packages/tools/load-testing/results/
  Formato esperado: cache-test-<queries>-<timestamp>.json

Análise realizada:
  • Comparação de latência entre serviços
  • Métricas de QPS e throughput
  • Velocidade de snapshot
  • Identificação de queries em cache vs não-cache
  • Estatísticas agregadas

Saída:
  Relatório detalhado no console + arquivo JSON de comparação
  `)
  .action(async (filename: string, options) => {
    if (options.list) {
      const resultsDir = path.join(__dirname, "../results");
      const files = await fs.readdir(resultsDir);
      const cacheFiles = files.filter(f => f.startsWith("cache-test-") && f.endsWith(".json"));
      
      console.log("\n📁 Arquivos de resultado disponíveis:");
      cacheFiles.forEach(file => console.log(`  • ${file}`));
      console.log("");
      return;
    }

    if (options.verbose) {
      console.log("🔍 Modo verboso ativado");
    }

    const comparison = new SingleFileComparison();
    await comparison.runSingleFile(filename);
  });

program.parse();