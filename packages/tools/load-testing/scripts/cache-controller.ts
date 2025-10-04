import { CLI } from "../utils/cli";
import { Logger } from "../utils/logger";

import promises from "fs/promises";

export class CacheController {
  cli: CLI;
  logger: Logger;

  dragonflyHost: string;
  dragonflyPort: number;
  redisHost: string;
  redisPort: number;

  constructor(logger: Logger, cli: CLI) {
    // Dragonfly (origem) e Redis (destino) configs
    this.dragonflyHost = "localhost";
    this.dragonflyPort = 6380; // Cache principal (origem)
    this.redisHost = "localhost";
    this.redisPort = 6379; // Destino da migração

    this.logger = logger;
    this.cli = cli;
  }

  async checkDragonflyData() {
    try {
      const result = await this.cli.execCommand(
        `redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} DBSIZE`
      );
      const keyCount = parseInt(result.stdout);
      this.logger.log("INFO", `Dragonfly contém ${keyCount} chaves em cache`);
      return keyCount;
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro ao verificar dados do Dragonfly: ${(error as Error).message}`
      );

      return 0;
    }
  }

  async migrateDragonflyToRedis() {
    this.logger.log(
      "INFO",
      "Iniciando migração de dados do Dragonfly para o Redis"
    );

    try {
      // Primeiro, verificar dados no Dragonfly
      const dragonflyKeys = await this.checkDragonflyData();

      if (dragonflyKeys === 0) {
        this.logger.log("WARN", "Não há dados no Dragonfly para migrar");
        return false;
      }

      this.logger.log("INFO", "Obtendo todas as chaves do Dragonfly...");
      const keysResult = await this.cli.execCommand(
        `redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} KEYS "*"`
      );
      const keys = keysResult.stdout
        .split("\n")
        .filter((key) => key.trim() !== "");

      if (keys.length === 0) {
        this.logger.log("WARN", "Nenhuma chave encontrada no Dragonfly");
        return false;
      }

      this.logger.log("INFO", `Encontradas ${keys.length} chaves para migrar`);

      // Migrar chaves do Dragonfly para Redis
      let migratedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        try {
          // Obter TTL da chave do Dragonfly
          const ttlResult = await this.cli.execCommand(
            `redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} TTL "${key}"`
          );
          const ttl = parseInt(ttlResult.stdout);

          // Obter valor da chave do Dragonfly
          const getResult = await this.cli.execCommand(
            `redis-cli -h ${this.dragonflyHost} -p ${this.dragonflyPort} GET "${key}"`
          );
          const value = getResult.stdout.trim();

          if (value && value !== "(nil)") {
            // Criar arquivo temporário de forma segura
            const tempFile = `/tmp/redis_migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`;

            try {
              // Escrever valor no arquivo usando Node.js (evita problemas com shell)
              await promises.writeFile(tempFile, value, "utf8");

              // Migrar usando redis-cli com arquivo
              let setCmd;
              if (ttl > 0) {
                setCmd = `redis-cli -h ${this.redisHost} -p ${this.redisPort} -x SETEX "${key}" ${ttl} < "${tempFile}"`;
              } else {
                setCmd = `redis-cli -h ${this.redisHost} -p ${this.redisPort} -x SET "${key}" < "${tempFile}"`;
              }

              await this.cli.execCommand(setCmd);
              migratedCount++;
            } finally {
              // Limpar arquivo temporário
              await promises.unlink(tempFile).catch(() => {});
            }
          }
        } catch (error) {
          errorCount++;

          this.logger.log(
            "WARN",
            `Erro ao migrar chave ${key}: ${(error as Error).message}`
          );
        }

        // Atualizar progresso
        const progress = (((i + 1) / keys.length) * 100).toFixed(1);
        process.stdout.write(
          `\r\x1b[35m[MIGRAÇÃO]\x1b[0m Progresso: ${i + 1}/${keys.length} (${progress}%) | Migradas: ${migratedCount} | Erros: ${errorCount}`
        );
      }

      console.log(""); // Nova linha

      // Verificar migração
      const redisResult = await this.cli.execCommand(
        `redis-cli -h ${this.redisHost} -p ${this.redisPort} DBSIZE`
      );
      const redisKeysAfter = parseInt(redisResult.stdout);

      this.logger.log("SUCCESS", `Migração concluída!`);
      this.logger.log(
        "INFO",
        `Chaves migradas: ${migratedCount}/${keys.length}`
      );
      this.logger.log(
        "INFO",
        `Chaves no Redis após migração: ${redisKeysAfter}`
      );

      if (errorCount > 0) {
        this.logger.log("WARN", `Erros durante migração: ${errorCount}`);
      }

      return migratedCount > 0;
    } catch (error) {
      this.logger.log(
        "ERROR",
        `Erro durante migração: ${(error as Error).message}`
      );
      return false;
    }
  }
}
