# DAAP - Guia para Agentes de IA

## Visão Geral da Arquitetura

Este é um projeto acadêmico de microserviços distribuídos que implementa um sistema de busca em reviews de produtos com **caching inteligente baseado em LFU (Least Frequently Used)** com pontuação temporal. O objetivo é demonstrar ganhos de performance através de estratégias de caching sofisticadas.

### Componentes Principais

```
Cliente → Traefik → Reviews Service → Cache Service → Search Service
                                    ↓                    ↓
                                  Redis/Dragonfly      MongoDB
```

**Fluxo de dados crítico**:
1. Reviews Service recebe requisição de busca em `/api/reviews/search`
2. Delega para Cache Service em `http://cache-service:3002/search`
3. Cache Service verifica cache (Redis/Dragonfly) via LFU Manager
4. Se miss: busca em Search Service `http://search-service:3003/search` → MongoDB
5. Se hit: retorna do cache + incrementa frequência + atualiza lastAccess

### Por Que Esta Arquitetura?

- **Separação de Responsabilidades**: Cache Service isolado permite trocar backend (Redis ↔ Dragonfly) sem afetar outros serviços
- **LFU Manager**: Implementação custom que combina frequência de acesso + tempo (eviction baseada em score = `1/(freq+1) + age*0.1`)
- **Keyword Extraction**: Cache entries são indexados por keywords extraídas da query para tracking granular
- **Fallback Resiliente**: Reviews Service tem fallback direto para Search Service se Cache Service falhar

## Estrutura do Monorepo (pnpm + Turbo)

```
apps/
  cache-service/     # NestJS - Orquestra cache + LFU + keywords
  reviews-service/   # NestJS - Entry point, delega para cache
  search-service/    # NestJS - Busca texto completo no MongoDB
packages/
  schema/            # @daap/schema - Review schema compartilhado
  logger/            # @daap/logger - Logger minimalista
  typescript-config/ # Configurações TS base (base, api)
  eslint-config/     # Regras ESLint compartilhadas
  jest-presets/      # Configuração Jest compartilhada
  tools/             # Scripts de load testing e benchmarking
```

**Dependências entre serviços**: Reviews → Cache → Search (sequencial). Todos compartilham `@daap/schema` para tipos do MongoDB.

## Comandos de Desenvolvimento Essenciais

**Ordem de inicialização**:
```bash
# 1. Infraestrutura primeiro
docker-compose up -d mongodb redis dragonfly traefik

# 2. Serviços em ordem de dependência
pnpm --filter @daap/search-service start:dev   # Porta 3003
pnpm --filter @daap/cache-service start:dev    # Porta 3002
pnpm --filter @daap/reviews-service start:dev  # Porta 3001

# OU todos juntos (Turbo gerencia ordem)
pnpm start:dev
```

**CLI de gerenciamento** (`daap.sh`):
```bash
./daap.sh deploy 5      # Deploy com 5 instâncias de reviews-service
./daap.sh scale 8       # Escala para 8 instâncias
./daap.sh logs cache    # Logs do cache-service
./daap.sh monitor       # Status de todos os serviços
./daap.sh test 1000 10  # Load test: 1000 reqs, 10 concurrent
```

**Build para produção**:
```bash
# Turbo faz prune automático nos Dockerfiles
docker-compose up -d --build
```

**Testes de carga** (crítico para validação do cache):
```bash
cd packages/tools/load-testing
pnpm test:bulk 10000 5  # 10k queries, 5 concurrent
pnpm analyze:keywords   # Analisa keywords mais frequentes
pnpm compare:cache      # Compara Redis vs Dragonfly
```

## Convenções e Padrões Específicos

### Estrutura de Módulos NestJS

**Padrão consistente** em `apps/*/src/modules/`:
```
nome-modulo/
  controller.ts  # Sem sufixo .controller
  service.ts     # Sem sufixo .service
  module.ts      # Importa e exporta
```

**Exemplo**: [cache-service/src/modules/cache/](apps/cache-service/src/modules/cache/)

### Gestão de Configuração

**Nunca use process.env diretamente**. Use `SecretsService` (Global Module):

```typescript
// apps/*/src/lib/modules/global/secrets/service.ts
@Injectable()
export class SecretsService {
  SEARCH_SERVICE_URL: string;
  CACHE_SERVICE_URL: string;
  MONGO_URI: string;
  // ...
}

// Injetar no construtor
constructor(private readonly secretsService: SecretsService) {}
const url = this.secretsService.SEARCH_SERVICE_URL;
```

**Por quê?** Centraliza validação e fornece intellisense. Ver [.env.example](.env.example) para lista completa.

### Cache Key Generation

Padrão **consistente** em todo o sistema:
```typescript
private generateCacheKey(query: string, page: number, size: number): string {
  return `search:${query}:${page}:${size}`;
}
```

**Prefixos Redis críticos** (ver [lfu-manager.service.ts:18-22](apps/cache-service/src/lib/cache/lfu-manager.service.ts#L18-L22)):
```
keyword:freq:{keyword}    # Contador de frequência
keyword:keys:{keyword}    # Set de cache keys associadas
cache:meta:{cacheKey}     # Metadados (CacheEntryMetadata)
keywords:ranking          # Sorted set global
cache:entries             # Set de todas as chaves de cache
```

### Implementação LFU - Algoritmo de Eviction

**Score de eviction** ([lfu-manager.service.ts:188-194](apps/cache-service/src/lib/cache/lfu-manager.service.ts#L188-L194)):
```typescript
const timeSinceAccess = Date.now() - metadata.lastAccess;
const ageInHours = timeSinceAccess / (1000 * 60 * 60);
const score = (1 / (metadata.frequency + 1)) + (ageInHours * 0.1);
```

**Lógica**: Score ALTO = evict primeiro (baixa freq + antigo). Ver [RESULTS.md:60-110](RESULTS.md#L60-L110) para análise detalhada.

**Quando evict acontece** ([lfu-manager.service.ts:271-293](apps/cache-service/src/lib/cache/lfu-manager.service.ts#L271-L293)):
- Após cada `.set()` via `checkAndEvict()`
- Se `countCacheEntries() > config.maxEntries` (default: 1000, configurável via `LFU_MAX_ENTRIES`)
- Remove em lote: `evictionBatchSize` (default: 50)

### Keyword Extraction

**Palavras-chave são extraídas de queries** e usadas para tracking ([keyword.service.ts](apps/cache-service/src/lib/cache/keyword.service.ts)):
```typescript
// Exemplo: "laptop screen protector" → ["laptop", "screen", "protector"]
const keywords = this.keywordService.extractKeywords(query);
```

**Por quê?** Permite análise de popularidade de termos e invalidação granular por keyword.

### Tratamento de Erros - Fallback em Cascata

**Reviews Service tem fallback automático** ([reviews-service/src/modules/search/service.ts:21-53](apps/reviews-service/src/modules/search/service.ts#L21-L53)):
```typescript
try {
  // Tenta cache service primeiro
  return await httpService.get(`${cacheServiceUrl}/search`);
} catch (error) {
  // Fallback direto para search service
  return await httpService.get(`${searchServiceUrl}/search`);
}
```

**Cache Service não falha em errors de cache** - apenas loga e continua ([cache-service/src/modules/search/service.ts:32-34](apps/cache-service/src/modules/search/service.ts#L32-L34)):
```typescript
catch (cacheError) {
  console.error("SearchService: Cache error:", cacheError);
  // Continua para buscar no search service
}
```

## Pontos de Integração - API Contracts

### Reviews Service (Porta 3001)

**Entry point principal**:
```http
GET http://reviews.localhost/search?q={query}&page={page}&size={size}
```

**Response**:
```typescript
interface SearchResult {
  items: Review[];      // Array de reviews do MongoDB
  total: number;        // Total de resultados encontrados
  page: number;
  size: number;
  source: 'cache' | 'search' | 'search-direct';
}
```

### Cache Service (Porta 3002)

**Busca com cache**:
```http
GET http://cache.localhost/search?q={query}&page={page}&size={size}
```

**Invalidação**:
```http
DELETE http://cache.localhost/cache/invalidate?q={query}  # Query específica
DELETE http://cache.localhost/cache/invalidate            # Flush completo
```

**Estatísticas LFU**:
```http
GET http://cache.localhost/cache/statistics
GET http://cache.localhost/cache/info
GET http://cache.localhost/cache/keywords?limit=50
```

### Search Service (Porta 3003)

**Busca direta no MongoDB**:
```http
GET http://search.localhost/search?q={query}&page={page}&size={size}
```

Usa `$text` search do MongoDB com índice em `reviewText` e `summary`.

### Traefik (Load Balancer)

**Health checks automáticos** em `/health` (todas as apps):
- Intervalo: `HEALTH_CHECK_INTERVAL` (default: 30s)
- Timeout: `HEALTH_CHECK_TIMEOUT` (default: 10s)
- Remove instâncias não-responsivas do pool

**Dashboard**: `http://traefik.localhost:8080`

## Schema do MongoDB

**Review Schema** ([packages/schema/src/reviews/review.schema.ts](packages/schema/src/reviews/review.schema.ts)):
```typescript
{
  reviewerID: string;
  asin: string;           // Product ID
  reviewerName: string;
  helpful: number[];
  reviewText: string;     // Full review text (indexed)
  overall: number;        // Rating 1-5
  summary: string;        // Review title (indexed)
  unixReviewTime: number;
  reviewTime: string;
  category: string;
  class: number;
}
```

**Índices comentados** (linhas 44-58): Os índices de texto estão desabilitados nos schemas. Para habilitar busca full-text, descomentar:
```typescript
ReviewSchema.index(
  { reviewText: "text", summary: "text" },
  { default_language: "english" }
);
```

## Docker Multi-Stage Build

**Padrão em todos os Dockerfiles** ([apps/cache-service/Dockerfile](apps/cache-service/Dockerfile)):
```dockerfile
# Stage 1: Turbo prune (remove deps desnecessárias)
turbo prune @daap/cache-service --docker

# Stage 2: Install + Build (apenas workspace filtrado)
pnpm install
pnpm turbo build

# Stage 3: Runtime mínimo (copia apenas dist/ e node_modules)
CMD ["node", "apps/cache-service/dist/main.js"]
```

**Por quê?** Reduz tamanho da imagem final (~200MB vs ~1GB).

## Variáveis de Ambiente Críticas

**Switching de backend de cache**:
```bash
CACHE_ADAPTER=redis       # ou dragonfly
REDIS_HOST=redis          # Container name
REDIS_PORT=6379
DRAGONFLY_HOST=dragonfly
DRAGONFLY_PORT=6379       # Dragonfly usa mesma porta Redis
```

**URLs internas (Docker network)**:
```bash
CACHE_SERVICE_URL=http://cache-service:3002
SEARCH_SERVICE_URL=http://search-service:3003
MONGO_URI=mongodb://admin:admin@mongodb:27017/daap?authSource=admin
```

**Configuração LFU**:
```bash
LFU_MAX_ENTRIES=1000           # Max cache entries antes de evict
LFU_EVICTION_BATCH_SIZE=50     # Quantos remover por vez
```

**Logging**:
```bash
DEBUG=true                     # Habilita logs detalhados
LOG_LEVEL=info                 # error, warn, info, debug
```

Ver [.env.example](.env.example) para lista completa.

## Performance - Resultados Reais

**Dados de [RESULTS.md](RESULTS.md)**:

| Consultas | Backend   | Tempo c/ Cache | Tempo s/ Cache | Ganho     |
|-----------|-----------|----------------|----------------|-----------|
| 1.000     | Redis     | 8ms            | 7580ms         | 99.89%    |
| 10.000    | Redis     | 8ms            | 9656ms         | 99.92%    |
| 100.000   | Redis     | 8ms            | 6988ms         | 99.87%    |

**Taxa de hit** (100k queries): 76-99% dependendo da keyword (ver RESULTS.md:42-58).

**CPU**: 6-12% com cache vs 95% sem cache (5 conexões paralelas).

## Debugging Comum

**Cache não está funcionando?**
1. Verificar `docker-compose logs cache-service` - procurar por "LFU Manager initialized"
2. Testar manualmente: `curl "http://cache.localhost/search?q=laptop&page=1&size=10"`
3. Verificar Redis: `docker exec -it daap-redis redis-cli KEYS "search:*"`

**Reviews Service retornando `source: 'search-direct'`?**
- Cache Service está down ou inacessível
- Verificar network: `docker network inspect daap_app_network`

**Eviction não está acontecendo?**
- Verificar `LFU_MAX_ENTRIES` no `.env`
- Conferir logs: `checkAndEvict` deve aparecer quando limite é atingido

**MongoDB sem resultados?**
- Database precisa estar populado com reviews
- Índices de texto devem estar criados (ver Schema do MongoDB acima)

## Testes e Benchmarking

**Scripts de load testing** ([packages/tools/load-testing/scripts/](packages/tools/load-testing/scripts/)):
- `bulk-test-runner.ts`: Executa N queries concorrentes
- `cache-result-comparison.ts`: Compara Redis vs Dragonfly
- `keyword-analyzer.ts`: Analisa keywords mais acessadas
- `query-generator.ts`: Gera queries sintéticas a partir do dataset
- `benchmark-analyzer.ts`: Processa resultados e gera estatísticas

**Como rodar**:
```bash
cd packages/tools/load-testing
pnpm install
pnpm test:bulk 10000 5  # 10k queries, 5 concurrent
```

Resultados salvos em `packages/tools/load-testing/results/`.

## Extensões Futuras

**Ao adicionar novos recursos**:
- Novos serviços devem seguir estrutura `apps/{service-name}/src/modules/`
- Sempre usar `SecretsService` para configuração
- Adicionar health check endpoint (`/health`)
- Configurar labels Traefik no `docker-compose.yml`
- Atualizar `daap.sh` se houver comandos de gerenciamento específicos

**Cache adapters adicionais**:
- Implementar interface [CacheAdapter](apps/cache-service/src/lib/cache/adapter.ts)
- Adicionar em `apps/cache-service/src/lib/cache/implementations/`
- Registrar no módulo de cache com provider condicional

**Keywords customizadas**:
- Editar [keyword.service.ts](apps/cache-service/src/lib/cache/keyword.service.ts)
- Adicionar stopwords em `LFUConfig.stopWords`
- Configurar `keywordMinLength` via env vars