#!/usr/bin/env node

/**
 * Cache Migration Script
 *
 * Este script executa as seguintes funções:
 * 1. Verifica/cria arquivos de queries com a quantidade especificada
 * 2. Executa queries concorrentes e armazena no cache Redis
 * 3. Migra dados do Redis para o Dragonfly
 * 4. Mostra progresso em tempo real
 */

import fs from "fs";
import path from "path";
import http from "http";
import { Command } from "commander";

import { Logger } from "../utils/logger";
import { CLI } from "../utils/cli";
import { CacheController } from "./cache-controller";

class BulkTestRunner {
  cli: CLI;
  logger: Logger;
  cacheController: CacheController;

  queryCount: number;
  concurrency: number;
  dataDir: string;
  resultsDir: string;
  queryFile: string;
  baseUrl: string;
  reviewsHost: string;
  completedQueries: number;
  totalQueries: number;
  errors: number;

  queries: string[] = [];

  constructor(
    queryCount: string,
    concurrency: string,
    logger: Logger,
    cli: CLI,
    cacheController: CacheController
  ) {
    this.queryCount = parseInt(queryCount) || 100;
    this.concurrency = parseInt(concurrency) || 5;
    this.dataDir = path.join(__dirname, "../data");
    this.resultsDir = path.join(__dirname, "../results");
    this.queryFile = path.join(this.dataDir, `queries-${this.queryCount}.json`);

    // URLs dos serviços
    this.baseUrl = "http://localhost";
    this.reviewsHost = "reviews.localhost";

    // Contadores de progresso
    this.completedQueries = 0;
    this.totalQueries = 0;
    this.errors = 0;

    this.ensureDirs();

    this.cli = cli;
    this.logger = logger;
    this.cacheController = cacheController;
  }

  ensureDirs() {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async checkQueryFile() {
    this.logger.log(
      "INFO",
      `Verificando arquivo de queries: queries-${this.queryCount}.json`
    );

    if (fs.existsSync(this.queryFile)) {
      this.logger.log("SUCCESS", "Arquivo de queries encontrado");
      return true;
    }

    this.logger.log("WARN", "Arquivo de queries não encontrado. Gerando...");

    try {
      const generatorPath = path.join(__dirname, "query-generator.ts");
      const command = `tsx "${generatorPath}" ${this.queryCount}`;

      await this.cli.execCommand(command);

      if (fs.existsSync(this.queryFile)) {
        this.logger.log(
          "SUCCESS",
          `Arquivo queries-${this.queryCount}.json gerado com sucesso`
        );
        return true;
      } else {
        throw new Error("Falha ao gerar arquivo de queries");
      }
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro ao gerar arquivo de queries: ${(error as Error).message}`
      );
      return false;
    }
  }

  async loadQueries() {
    try {
      const data = fs.readFileSync(this.queryFile, "utf8");
      const queryData = JSON.parse(data);
      this.queries = queryData.queries || [];
      this.totalQueries = this.queries.length;
      this.logger.log("INFO", `Carregadas ${this.totalQueries} queries`);
      return true;
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro ao carregar queries: ${(error as Error).message}`
      );
      return false;
    }
  }

  async makeRequest(query: string, retryCount = 0) {
    return new Promise((resolve) => {
      const encodedQuery = encodeURIComponent(query);
      // Usar o endpoint real de busca do reviews service
      const path = `/search?q=${encodedQuery}`;

      const options = {
        hostname: "localhost",
        port: 80,
        path: path,
        method: "GET",
        headers: {
          Host: this.reviewsHost,
          "User-Agent": "bulk-test-runner/1.0",
        },
        timeout: 30000,
      };

      const startTime = Date.now();

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          const responseTime = Date.now() - startTime;
          this.completedQueries++;

          if (res.statusCode === 200) {
            let cached = false;

            try {
              const responseData = JSON.parse(data);
              cached = responseData.source === "cache";
            } catch (error) {
              // Se não conseguir parsear o JSON, assume que não veio do cache
              cached = false;
            }

            resolve({
              success: true,
              query,
              responseTime,
              status: res.statusCode,
              cached,
            });
          } else {
            this.errors++;
            resolve({
              success: false,
              query,
              responseTime,
              status: res.statusCode,
              error: `HTTP ${res.statusCode}`,
            });
          }
        });
      });

      req.on("error", (error) => {
        this.errors++;
        this.completedQueries++;
        const responseTime = Date.now() - startTime;

        if (retryCount < 2) {
          // Retry após 1 segundo
          setTimeout(() => {
            this.makeRequest(query, retryCount + 1).then(resolve);
          }, 1000);
        } else {
          resolve({
            success: false,
            query,
            responseTime,
            status: 0,
            error: error.message,
          });
        }
      });

      req.on("timeout", () => {
        req.destroy();
        this.errors++;
        this.completedQueries++;
        const responseTime = Date.now() - startTime;

        resolve({
          success: false,
          query,
          responseTime,
          status: 0,
          error: "Timeout",
        });
      });

      req.end();
    });
  }

  updateProgress() {
    const progress = (
      (this.completedQueries / this.totalQueries) *
      100
    ).toFixed(1);
    const successRate = (
      ((this.completedQueries - this.errors) / this.completedQueries) *
      100
    ).toFixed(1);

    // Criar barra de progresso visual
    const barWidth = 40;
    const filledWidth = Math.floor((this.completedQueries / this.totalQueries) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = '-'.repeat(filledWidth) + ' '.repeat(emptyWidth);

    process.stdout.write(
      `\r\x1b[35m[PROGRESS]\x1b[0m [${progressBar}] ${progress}% | Queries: ${this.completedQueries}/${this.totalQueries} | Sucessos: ${successRate}% | Erros: ${this.errors}`
    );

    if (this.completedQueries === this.totalQueries) {
      console.log(""); // Nova linha após completar
    }
  }

  async executeQueries() {
    this.logger.log(
      "INFO",
      `Iniciando execução de ${this.totalQueries} queries com concorrência ${this.concurrency}`
    );
    this.logger.log(
      "INFO",
      "Todas as queries serão executadas e armazenadas em cache no Dragonfly"
    );

    type Result = {
      success: boolean;
      query: string;
      responseTime: number;
      status: number;
      cached: boolean;
    };

    const results: Result[] = [];
    const startTime = Date.now();

    // Resetar contadores
    this.completedQueries = 0;
    this.errors = 0;

    // Executar queries com controle de concorrência contínua
    let queryIndex = 0;
    const activePromises = new Set<Promise<void>>();

    const executeNext = async () => {
      if (queryIndex >= this.queries.length) {
        return;
      }

      const currentQuery = this.queries[queryIndex];
      queryIndex++;

      const result = (await this.makeRequest(currentQuery)) as Result;
      results.push(result);
      this.updateProgress();

      // Executar próxima query
      if (queryIndex < this.queries.length) {
        const nextPromise = executeNext();
        activePromises.add(nextPromise);
        await nextPromise;
        activePromises.delete(nextPromise);
      }
    };

    // Iniciar execução com o número de queries simultâneas definido pela concorrência
    const initialPromises = [];
    for (let i = 0; i < Math.min(this.concurrency, this.queries.length); i++) {
      initialPromises.push(executeNext());
    }

    await Promise.all(initialPromises);

    const totalTime = Date.now() - startTime;

    this.logger.log(
      "SUCCESS",
      `Queries executadas em ${(totalTime / 1000).toFixed(2)}s`
    );
    this.logger.log(
      "INFO",
      `Total: ${results.length} | Sucessos: ${results.filter((r) => r.success).length} | Erros: ${this.errors}`
    );

    // Salvar resultados
    const resultsFile = path.join(
      this.resultsDir,
      `cache-test-${this.queryCount}-${Date.now()}.json`
    );
    fs.writeFileSync(
      resultsFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          queryCount: this.queryCount,
          concurrency: this.concurrency,
          totalTime,
          results,
        },
        null,
        2
      )
    );

    this.logger.log(
      "INFO",
      `Resultados salvos em: ${path.basename(resultsFile)}`
    );

    return results;
  }

  async run() {
    console.log("\n" + "=".repeat(80));
    console.log("🚀 CACHE MIGRATION TEST SCRIPT");
    console.log("=".repeat(80));
    console.log(
      `Queries: ${this.queryCount} | Concorrência: ${this.concurrency}\n`
    );

    try {
      // Etapa 1: Verificar/criar arquivo de queries
      console.log("📋 ETAPA 1: Verificação de Arquivos de Queries");
      console.log("-".repeat(50));

      if (!(await this.checkQueryFile())) {
        throw new Error("Falha ao verificar/criar arquivo de queries");
      }

      // Etapa 2: Carregar queries
      console.log("\n📚 ETAPA 2: Carregamento de Queries");
      console.log("-".repeat(50));

      if (!(await this.loadQueries())) {
        throw new Error("Falha ao carregar queries");
      }

      // Etapa 3: Executar queries e popular cache
      console.log("\n🔄 ETAPA 3: Execução de Queries e Cache no Dragonfly");
      console.log("-".repeat(50));

      await this.executeQueries();

      // Etapa 4: Migrar do Dragonfly para Redis
      console.log("\n🔄 ETAPA 4: Migração Dragonfly → Redis");
      console.log("-".repeat(50));

      await this.cacheController.migrateDragonflyToRedis();

      console.log("\n" + "=".repeat(80));
      this.logger.log("SUCCESS", "SCRIPT CONCLUÍDO COM SUCESSO!");
      console.log("=".repeat(80) + "\n");
    } catch (error) {
      console.log("\n" + "=".repeat(80));
      this.logger.log(
        "ERROR",
        `FALHA NA EXECUÇÃO: ${(error as Error).message}`
      );
      console.log("=".repeat(80) + "\n");
      process.exit(1);
    }
  }
}

// Configurar CLI com Commander
const program = new Command();

program
  .name('bulk-test-runner')
  .description('Executa testes de cache em lote com queries concorrentes e migração de dados')
  .version('1.0.0')
  .argument('<queries>', 'Número total de queries a executar')
  .argument('<concurrency>', 'Número de queries simultâneas')
  .option('-v, --verbose', 'Modo verboso com logs detalhados')
  .option('--skip-migration', 'Pular a etapa de migração de cache')
  .addHelpText('after', `

Exemplos:
  $ bulk-test-runner 1000 10          Executa 1000 queries com concorrência de 10
  $ bulk-test-runner 5000 20 -v       Executa 5000 queries com logs detalhados
  $ bulk-test-runner 100 5 --skip-migration   Executa queries sem migração

Descrição:
  Este script realiza testes de carga em serviços de cache, executando
  queries concorrentes e armazenando resultados. Também migra dados entre
  Redis e Dragonfly para análise de performance.

Etapas executadas:
  1. Verificação/criação de arquivo de queries
  2. Carregamento de queries
  3. Execução concorrente com cache no Dragonfly
  4. Migração opcional de Dragonfly para Redis
  `)
  .action(async (queries: string, concurrency: string, options) => {
    const cli = new CLI();
    const logger = new Logger();
    const cacheController = new CacheController(logger, cli);
    const test = new BulkTestRunner(
      queries,
      concurrency,
      logger,
      cli,
      cacheController
    );

    if (options.verbose) {
      logger.log("INFO", "Modo verboso ativado");
    }

    if (options.skipMigration) {
      logger.log("WARN", "Migração de cache será pulada");
    }

    await test.run();
  });

program.parse();
