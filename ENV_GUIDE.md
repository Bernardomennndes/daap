# Configuração de Variáveis de Ambiente - DAAP

Este documento descreve todas as variáveis de ambiente disponíveis no projeto DAAP e como configurá-las.

## 📋 Arquivo de Configuração

O projeto utiliza um arquivo `.env` para centralizar todas as configurações. Use o arquivo `.env.example` como base:

```bash
cp .env.example .env
```

## 🔧 Validação de Configuração

Antes de fazer o deploy, sempre valide sua configuração:

```bash
./validate-env.sh
```

## 📖 Variáveis Disponíveis

### 🏗️ Configuração de Escalonamento

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `REVIEWS_INSTANCES` | `3` | Número de instâncias do reviews-service |

### 🌐 Portas dos Serviços

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `REVIEWS_SERVICE_PORT` | `3001` | Porta do reviews-service |
| `CACHE_SERVICE_PORT` | `3002` | Porta do cache-service |
| `SEARCH_SERVICE_PORT` | `3003` | Porta do search-service |
| `WEB_PORT` | `3000` | Porta da interface web |

### 🔗 URLs Internas (Docker Network)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `REVIEWS_SERVICE_URL` | `http://reviews-service:3001` | URL interna do reviews-service |
| `CACHE_SERVICE_URL` | `http://cache-service:3002` | URL interna do cache-service |
| `SEARCH_SERVICE_URL` | `http://search-service:3003` | URL interna do search-service |

### 🌍 URLs Externas (Traefik)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `REVIEWS_EXTERNAL_URL` | `http://reviews.localhost` | URL externa do reviews-service |
| `CACHE_EXTERNAL_URL` | `http://cache.localhost` | URL externa do cache-service |
| `SEARCH_EXTERNAL_URL` | `http://search.localhost` | URL externa do search-service |
| `WEB_EXTERNAL_URL` | `http://daap.localhost` | URL externa da interface web |

### 🔄 Configuração do Traefik

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `TRAEFIK_DASHBOARD_PORT` | `8080` | Porta do dashboard do Traefik |
| `TRAEFIK_WEB_PORT` | `80` | Porta HTTP do Traefik |
| `TRAEFIK_WEBSECURE_PORT` | `443` | Porta HTTPS do Traefik |

### 💾 Configuração do Banco de Dados

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `MONGO_URI` | `mongodb://admin:admin@mongodb:27017/daap?authSource=admin` | URI completa do MongoDB |
| `MONGO_INITDB_ROOT_USERNAME` | `admin` | Usuário root do MongoDB |
| `MONGO_INITDB_ROOT_PASSWORD` | `admin` | Senha root do MongoDB |
| `MONGO_HOST` | `mongodb` | Host do MongoDB |
| `MONGO_PORT` | `27017` | Porta do MongoDB |
| `MONGO_DATABASE` | `daap` | Nome da base de dados |

### ⚡ Configuração do Cache

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `CACHE_ADAPTER` | `redis` | Tipo de cache (redis/dragonfly) |
| `REDIS_HOST` | `redis` | Host do Redis |
| `REDIS_PORT` | `6379` | Porta do Redis |
| `REDIS_URL` | `redis://redis:6379` | URL completa do Redis |
| `DRAGONFLY_HOST` | `dragonfly` | Host do Dragonfly |
| `DRAGONFLY_PORT` | `6379` | Porta do Dragonfly |

### 🔐 Configuração de Autenticação

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SECRET_JWT` | `ca6d0e6f-ece4-43d8-bbda-71e873633a07` | Chave secreta JWT ⚠️ **Altere em produção!** |

### 🔧 Configuração de Debug

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `ENV` | `dev` | Ambiente (dev/production) |
| `DEBUG` | `true` | Ativar modo debug |
| `LOG_LEVEL` | `info` | Nível de log (error/warn/info/debug) |
| `TZ` | `America/Sao_Paulo` | Fuso horário |

### 🏥 Health Checks

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `HEALTH_CHECK_INTERVAL` | `30` | Intervalo entre health checks (segundos) |
| `HEALTH_CHECK_TIMEOUT` | `10` | Timeout do health check (segundos) |

### 📊 Monitoramento e Observabilidade

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `ELK_URL` | `http://0.0.0.0:9200/` | URL do Elasticsearch |
| `JAEGER_URL` | `http://0.0.0.0:16686/search` | URL do Jaeger |
| `KIBANA_URL` | `http://0.0.0.0:5601/app/home` | URL do Kibana |
| `REDIS_COMMANDER_URL` | `http://0.0.0.0:8081` | URL do Redis Commander |

### 🌐 APIs Externas

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `GITHUB_SCRAP_API` | `https://legend-of-github-api.herokuapp.com` | API externa do GitHub |

## 🚀 Configurações para Produção

Para produção, recomenda-se alterar as seguintes configurações:

```bash
ENV=production
DEBUG=false
LOG_LEVEL=warn
SECRET_JWT=your-super-secure-jwt-secret-here
MONGO_INITDB_ROOT_PASSWORD=your-secure-mongo-password
TRAEFIK_WEBSECURE_PORT=443
```

## 🔍 Troubleshooting

### Problema: Serviços não conseguem se comunicar
**Solução**: Verifique se as URLs internas estão usando os nomes dos containers:
- ✅ `http://cache-service:3002`
- ❌ `http://localhost:3002`

### Problema: Load balancer não funciona
**Solução**: Verifique se as portas estão corretas nos labels do Traefik:
```yaml
- "traefik.http.services.reviews-service.loadbalancer.server.port=${REVIEWS_SERVICE_PORT:-3001}"
```

### Problema: Health checks falham
**Solução**: Ajuste os intervalos e timeouts:
```bash
HEALTH_CHECK_INTERVAL=60
HEALTH_CHECK_TIMEOUT=30
```

## 🛠️ Scripts de Configuração

- `./validate-env.sh` - Valida todas as variáveis de ambiente
- `./setup-info.sh` - Mostra resumo da configuração
- `./deploy.sh N` - Deploy com N instâncias do reviews-service

## 📚 Referências

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)
- [MongoDB Connection String](https://docs.mongodb.com/manual/reference/connection-string/)
