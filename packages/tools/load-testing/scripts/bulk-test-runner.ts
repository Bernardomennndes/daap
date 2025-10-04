#!/usr/bin/env node

/**
 * Cache Migration Script
 *
 * Este script executa as seguintes funções:
 * 1. Verifica/cria arquivos de queries com a quantidade especificada
 * 2. Executa queries concorrentes e armazena no cache Redis
 * 3. Migra dados do Redis para o Dragonfly
 * 4. Mostra progresso em tempo real
 *
 * Uso: node bulk-test-runner.js <queries> <concorrencia>
 * Exemplo: node bulk-test-runner.js 1000 10
 */

import fs from "fs";
import path from "path";
import http from "http";

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
      const generatorPath = path.join(__dirname, "query-generator.js");
      const command = `node "${generatorPath}" ${this.queryCount}`;

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

    process.stdout.write(
      `\r\x1b[35m[PROGRESS]\x1b[0m Queries: ${this.completedQueries}/${this.totalQueries} (${progress}%) | Sucessos: ${successRate}% | Erros: ${this.errors}`
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

    // Executar queries com controle de concorrência
    const executeChunk = async (queryChunk: string[]) => {
      const promises = queryChunk.map((query) => this.makeRequest(query));
      const chunkResults = (await Promise.all(promises)) as Result[];
      results.push(...chunkResults);

      // Atualizar progresso após cada chunk
      this.updateProgress();
    };

    // Dividir queries em chunks baseados na concorrência
    const chunks = [];
    for (let i = 0; i < this.queries.length; i += this.concurrency) {
      chunks.push(this.queries.slice(i, i + this.concurrency));
    }

    // Executar chunks sequencialmente
    for (const chunk of chunks) {
      await executeChunk(chunk);
    }

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

// Verificar argumentos da linha de comando
if (process.argv.length < 4) {
  console.log("\nUso: node bulk-test-runner.js <queries> <concorrencia>");
  console.log("Exemplo: node bulk-test-runner.js 1000 10\n");
  console.log("Parâmetros:");
  console.log("  queries      - Número total de queries a executar");
  console.log("  concorrencia - Número de queries simultâneas\n");
  process.exit(1);
}

const [, , queryCount, concurrency] = process.argv;

const cli = new CLI();
const logger = new Logger();
const cacheController = new CacheController(logger, cli);
const test = new BulkTestRunner(
  queryCount,
  concurrency,
  logger,
  cli,
  cacheController
);

test.run().catch(console.error);
