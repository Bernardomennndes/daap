# Cache Service

Serviço de cache que atua como middleware entre o `reviews-service` e o `search-service`, fornecendo cache inteligente para otimizar consultas de busca.

## Arquitetura

### Abstração de Cache
O serviço utiliza uma arquitetura baseada em adaptadores que permite trocar facilmente entre diferentes sistemas de cache:

- **Redis Adapter**: Implementação padrão usando Redis
- **Dragonfly Adapter**: Implementação alternativa usando Dragonfly
- **Cache Adapter**: Classe abstrata que define a interface comum

### Fluxo de Operação
1. **reviews-service** → **cache-service** (verificação de cache)
2. Se cache existe: retorna dados do cache
3. Se cache não existe: **cache-service** → **search-service** → armazena no cache → retorna resultado

## Variáveis de Ambiente

```bash
# Configuração do Cache
CACHE_TYPE=redis          # ou 'dragonfly'
CACHE_HOST=localhost
CACHE_PORT=6379
CACHE_PASSWORD=           # opcional
CACHE_DB=0               # opcional
CACHE_TTL=3600           # TTL padrão em segundos

# Configuração do Search Service
SEARCH_SERVICE_URL=http://localhost:3001

# Configuração da Aplicação
PORT=3001
ENV=development
```

## Comandos

```bash
# Instalar dependências
pnpm install

# Desenvolvimento
pnpm --filter @daap/cache-service run start:dev

# Build
pnpm --filter @daap/cache-service run build

# Produção
pnpm --filter @daap/cache-service run start

# Testes
pnpm --filter @daap/cache-service run test

# Linting
pnpm --filter @daap/cache-service run lint
```

## Endpoints

### Cache Operations
- `GET /cache/search?q={query}&page={page}&size={size}` - Buscar no cache
- `GET /cache/exists?q={query}&page={page}&size={size}` - Verificar se existe no cache
- `DELETE /cache/invalidate?q={query}` - Invalidar cache (query específica ou todo)

### Search Operations
- `GET /search?q={query}&page={page}&size={size}` - Buscar com cache inteligente

### Health Check
- `GET /health` - Status do serviço

## Troca de Sistema de Cache

Para trocar do Redis para o Dragonfly:

1. Altere a variável de ambiente:
   ```bash
   CACHE_TYPE=dragonfly
   ```

2. Reinicie o serviço - a troca é automática via factory pattern

## Docker

```bash
docker build -t cache-service .
docker run -p 3002:3002 \
  -e CACHE_HOST=redis \
  -e SEARCH_SERVICE_URL=http://search-service:3003 \
  cache-service
```
