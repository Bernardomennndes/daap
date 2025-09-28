#!/usr/bin/env node

/**
 * Cache Migration Test Script
 * 
 * Este script executa as seguintes funções:
 * 1. Verifica/cria arquivos de queries com a quantidade especificada
 * 2. Executa queries concorrentes e armazena no cache Redis
 * 3. Migra dados do Redis para o Dragonfly
 * 4. Mostra progresso em tempo real
 * 
 * Uso: node cache-migration-test.js <queries> <concorrencia>
 * Exemplo: node cache-migration-test.js 1000 10
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const https = require('https');
const http = require('http');

class CacheMigrationTest {
  constructor(queryCount, concurrency) {
    this.queryCount = parseInt(queryCount) || 100;
    this.concurrency = parseInt(concurrency) || 5;
    this.dataDir = path.join(__dirname, '../data');
    this.resultsDir = path.join(__dirname, '../results');
    this.queryFile = path.join(this.dataDir, `queries-${this.queryCount}.json`);
    
    // URLs dos serviços
    this.baseUrl = 'http://localhost';
    this.reviewsHost = 'reviews.localhost';
    
    // Contadores de progresso
    this.completedQueries = 0;
    this.totalQueries = 0;
    this.errors = 0;
    
    // Dragonfly (origem) e Redis (destino) configs
    this.dragonflyHost = 'localhost';
    this.dragonflyPort = 6380;  // Cache principal (origem)
    this.redisHost = 'localhost';
    this.redisPort = 6379;      // Destino da migração
    
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
    const colors = {
      INFO: '\x1b[36m',    // Cyan
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      SUCCESS: '\x1b[32m', // Green
      PROGRESS: '\x1b[35m' // Magenta
    };
    const color = colors[level] || '\x1b[0m';
    console.log(`${color}[${timestamp}] [${level.padEnd(8)}]\x1b[0m ${message}`);
  }

  async execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      });
    });
  }

  async checkQueryFile() {
    this.log('INFO', `Verificando arquivo de queries: queries-${this.queryCount}.json`);
    
    if (fs.existsSync(this.queryFile)) {
      this.log('SUCCESS', 'Arquivo de queries encontrado');
      return true;
    }

    this.log('WARN', 'Arquivo de queries não encontrado. Gerando...');
    
    try {
      const generatorPath = path.join(__dirname, 'query-generator.js');
      const command = `node "${generatorPath}" ${this.queryCount}`;
      
      await this.execCommand(command);
      
      if (fs.existsSync(this.queryFile)) {
        this.log('SUCCESS', `Arquivo queries-${this.queryCount}.json gerado com sucesso`);
        return true;
      } else {
        throw new Error('Falha ao gerar arquivo de queries');
      }
    } catch (error) {
      this.log('ERROR', `Erro ao gerar arquivo de queries: ${error.message}`);
      return false;
    }
  }

  async loadQueries() {
    try {
      const data = fs.readFileSync(this.queryFile, 'utf8');
      const queryData = JSON.parse(data);
      this.queries = queryData.queries || [];
      this.totalQueries = this.queries.length;
      this.log('INFO', `Carregadas ${this.totalQueries} queries`);
      return true;
    } catch (error) {
      this.log('ERROR', `Erro ao carregar queries: ${error.message}`);
      return false;
    }
  }

  async makeRequest(query, retryCount = 0) {
    return new Promise((resolve) => {
      const encodedQuery = encodeURIComponent(query);
      // Usar o endpoint real de busca do reviews service
      const path = `/search?q=${encodedQuery}`;
      
      const options = {
        hostname: 'localhost',
        port: 80,
        path: path,
        method: 'GET',
        headers: {
          'Host': this.reviewsHost,
          'User-Agent': 'Cache-Migration-Test/1.0'
        },
        timeout: 30000
      };

      const startTime = Date.now();
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          this.completedQueries++;
          
          if (res.statusCode === 200) {
            resolve({
              success: true,
              query,
              responseTime,
              status: res.statusCode,
              cached: res.headers['x-cache-status'] === 'HIT'
            });
          } else {
            this.errors++;
            resolve({
              success: false,
              query,
              responseTime,
              status: res.statusCode,
              error: `HTTP ${res.statusCode}`
            });
          }
        });
      });

      req.on('error', (error) => {
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
            error: error.message
          });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        this.errors++;
        this.completedQueries++;
        const responseTime = Date.now() - startTime;
        
        resolve({
          success: false,
          query,
          responseTime,
          status: 0,
          error: 'Timeout'
        });
      });

      req.end();
    });
  }

  updateProgress() {
    const progress = ((this.completedQueries / this.totalQueries) * 100).toFixed(1);
    const successRate = (((this.completedQueries - this.errors) / this.completedQueries) * 100).toFixed(1);
    
    process.stdout.write(`\r\x1b[35m[PROGRESS]\x1b[0m Queries: ${this.completedQueries}/${this.totalQueries} (${progress}%) | Sucessos: ${successRate}% | Erros: ${this.errors}`);
    
    if (this.completedQueries === this.totalQueries) {
      console.log(''); // Nova linha após completar
    }
  }

  async executeQueries() {
    this.log('INFO', `Iniciando execução de ${this.totalQueries} queries com concorrência ${this.concurrency}`);
    this.log('INFO', 'Todas as queries serão executadas e armazenadas em cache no Dragonfly');
    
    const results = [];
    const startTime = Date.now();
    
    // Resetar contadores
    this.completedQueries = 0;
    this.errors = 0;

    // Executar queries com controle de concorrência
    const executeChunk = async (queryChunk) => {
      const promises = queryChunk.map(query => this.makeRequest(query));
      const chunkResults = await Promise.all(promises);
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
    
    this.log('SUCCESS', `Queries executadas em ${(totalTime / 1000).toFixed(2)}s`);
    this.log('INFO', `Total: ${results.length} | Sucessos: ${results.filter(r => r.success).length} | Erros: ${this.errors}`);
    
    // Salvar resultados
    const resultsFile = path.join(this.resultsDir, `cache-test-${this.queryCount}-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      queryCount: this.queryCount,
      concurrency: this.concurrency,
      totalTime,
      results
    }, null, 2));
    
    this.log('INFO', `Resultados salvos em: ${path.basename(resultsFile)}`);
    
    return results;
  }

  async checkDragonflyData() {
    try {
      const result = await this.execCommand(`redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} DBSIZE`);
      const keyCount = parseInt(result.stdout);
      this.log('INFO', `Dragonfly contém ${keyCount} chaves em cache`);
      return keyCount;
    } catch (error) {
      this.log('ERROR', `Erro ao verificar dados do Dragonfly: ${error.message}`);
      return 0;
    }
  }

  async migrateDragonflyToRedis() {
    this.log('INFO', 'Iniciando migração de dados do Dragonfly para o Redis');
    
    try {
      // Primeiro, verificar dados no Dragonfly
      const dragonflyKeys = await this.checkDragonflyData();
      
      if (dragonflyKeys === 0) {
        this.log('WARN', 'Não há dados no Dragonfly para migrar');
        return false;
      }

      this.log('INFO', 'Obtendo todas as chaves do Dragonfly...');
      const keysResult = await this.execCommand(`redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} KEYS "*"`);
      const keys = keysResult.stdout.split('\n').filter(key => key.trim() !== '');
      
      if (keys.length === 0) {
        this.log('WARN', 'Nenhuma chave encontrada no Dragonfly');
        return false;
      }

      this.log('INFO', `Encontradas ${keys.length} chaves para migrar`);

      // Migrar chaves do Dragonfly para Redis
      let migratedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        
        try {
          // Obter TTL da chave do Dragonfly
          const ttlResult = await this.execCommand(`redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} TTL "${key}"`);
          const ttl = parseInt(ttlResult.stdout);

          // Obter valor da chave do Dragonfly
          const getResult = await this.execCommand(`redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} GET "${key}"`);
          const value = getResult.stdout;

          if (value && value !== '(nil)') {
            // Salvar no Redis
            let setCmd;
            if (ttl > 0) {
              setCmd = `redis-cli -h ${this.redisHost} -p ${this.redisPort} SETEX "${key}" ${ttl} "${value}"`;
            } else {
              setCmd = `redis-cli -h ${this.redisHost} -p ${this.redisPort} SET "${key}" "${value}"`;
            }

            await this.execCommand(setCmd);
            migratedCount++;
          }
        } catch (error) {
          errorCount++;
          this.log('WARN', `Erro ao migrar chave ${key}: ${error.message}`);
        }

        // Atualizar progresso
        const progress = (((i + 1) / keys.length) * 100).toFixed(1);
        process.stdout.write(`\r\x1b[35m[MIGRAÇÃO]\x1b[0m Progresso: ${i + 1}/${keys.length} (${progress}%) | Migradas: ${migratedCount} | Erros: ${errorCount}`);
      }

      console.log(''); // Nova linha

      // Verificar migração
      const redisResult = await this.execCommand(`redis-cli -h ${this.redisHost} -p ${this.redisPort} DBSIZE`);
      const redisKeysAfter = parseInt(redisResult.stdout);

      this.log('SUCCESS', `Migração concluída!`);
      this.log('INFO', `Chaves migradas: ${migratedCount}/${keys.length}`);
      this.log('INFO', `Chaves no Redis após migração: ${redisKeysAfter}`);
      
      if (errorCount > 0) {
        this.log('WARN', `Erros durante migração: ${errorCount}`);
      }

      return migratedCount > 0;

    } catch (error) {
      this.log('ERROR', `Erro durante migração: ${error.message}`);
      return false;
    }
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 CACHE MIGRATION TEST SCRIPT');
    console.log('='.repeat(80));
    console.log(`Queries: ${this.queryCount} | Concorrência: ${this.concurrency}\n`);

    try {
      // Etapa 1: Verificar/criar arquivo de queries
      console.log('📋 ETAPA 1: Verificação de Arquivos de Queries');
      console.log('-'.repeat(50));
      
      if (!await this.checkQueryFile()) {
        throw new Error('Falha ao verificar/criar arquivo de queries');
      }

      // Etapa 2: Carregar queries
      console.log('\n📚 ETAPA 2: Carregamento de Queries');
      console.log('-'.repeat(50));
      
      if (!await this.loadQueries()) {
        throw new Error('Falha ao carregar queries');
      }

      // Etapa 3: Executar queries e popular cache
      console.log('\n🔄 ETAPA 3: Execução de Queries e Cache no Dragonfly');
      console.log('-'.repeat(50));
      
      await this.executeQueries();

      // Etapa 4: Migrar do Dragonfly para Redis
      console.log('\n🔄 ETAPA 4: Migração Dragonfly → Redis');
      console.log('-'.repeat(50));
      
      await this.migrateDragonflyToRedis();

      console.log('\n' + '='.repeat(80));
      this.log('SUCCESS', 'SCRIPT CONCLUÍDO COM SUCESSO!');
      console.log('='.repeat(80) + '\n');

    } catch (error) {
      console.log('\n' + '='.repeat(80));
      this.log('ERROR', `FALHA NA EXECUÇÃO: ${error.message}`);
      console.log('='.repeat(80) + '\n');
      process.exit(1);
    }
  }
}

// Verificar argumentos da linha de comando
if (process.argv.length < 4) {
  console.log('\nUso: node cache-migration-test.js <queries> <concorrencia>');
  console.log('Exemplo: node cache-migration-test.js 1000 10\n');
  console.log('Parâmetros:');
  console.log('  queries      - Número total de queries a executar');
  console.log('  concorrencia - Número de queries simultâneas\n');
  process.exit(1);
}

const [,, queryCount, concurrency] = process.argv;
const test = new CacheMigrationTest(queryCount, concurrency);
test.run().catch(console.error);
