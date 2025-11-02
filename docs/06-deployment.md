# Deployment Guide

## Table of Contents
- [Overview](#overview)
- [Container Orchestration](#container-orchestration)
- [Development Deployment](#development-deployment)
- [Production Deployment](#production-deployment)
- [Scaling Strategy](#scaling-strategy)
- [Configuration Management](#configuration-management)
- [Health Checks](#health-checks)
- [Monitoring & Alerting](#monitoring--alerting)

## Overview

The DAAP system uses **Docker Compose** for container orchestration, supporting both development and production deployments. The architecture is designed for **horizontal scaling** of the Reviews Service and **vertical scaling** of cache/database components.

## Container Orchestration

```mermaid
graph TB
    subgraph "Orquestração com Docker Compose"
        Compose[docker-compose.yml<br/>Definições de serviços]

        subgraph "Serviços de infraestrutura"
            Traefik[traefik<br/>Balanceador de carga]
            MongoDB[mongodb<br/>Banco de dados]
            Redis[redis<br/>Backend de cache]
            Dragonfly[dragonfly<br/>Cache alternativo]
            Jaeger[jaeger<br/>Rastreamento]
            Prometheus[prometheus<br/>Métricas]
            Grafana[grafana<br/>Painéis]
            InfluxDB[influxdb<br/>Métricas do K6]
        end

        subgraph "Serviços de aplicação"
            ReviewsScale[reviews-service<br/>Réplicas: ${REVIEWS_INSTANCES}]
            Cache[cache-service<br/>Instância única]
            Search[search-service<br/>Instância única]
        end

        subgraph "Recursos compartilhados"
            Network[app_network<br/>Rede bridge]
            Volumes[Volumes:<br/>- mongodb-data<br/>- redis-data<br/>- prometheus-data<br/>- grafana-data<br/>- influxdb-data]
        end
    end

    Compose --> Traefik
    Compose --> MongoDB
    Compose --> Redis
    Compose --> Dragonfly
    Compose --> Jaeger
    Compose --> Prometheus
    Compose --> Grafana
    Compose --> InfluxDB
    Compose --> ReviewsScale
    Compose --> Cache
    Compose --> Search

    Traefik -.-> Network
    MongoDB -.-> Network
    Redis -.-> Network
    ReviewsScale -.-> Network
    Cache -.-> Network
    Search -.-> Network

    MongoDB -.-> Volumes
    Redis -.-> Volumes
    Prometheus -.-> Volumes
    Grafana -.-> Volumes
    InfluxDB -.-> Volumes

    style Compose fill:#e1f5ff
    style Traefik fill:#ffe1e1
    style ReviewsScale fill:#e1ffe1
    style Cache fill:#fff4e1
    style Search fill:#f4e1ff
    style Network fill:#e1e1ff
    style Volumes fill:#f4ffe1
```

### Docker Compose Structure

**Location**: [docker-compose.yml](../docker-compose.yml)

```yaml
version: '3.8'

services:
  # Load Balancer
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml
    networks:
      - app_network

  # Reviews Service (Scalable)
  reviews-service:
    build:
      context: .
      dockerfile: ./apps/reviews-service/Dockerfile
    deploy:
      replicas: ${REVIEWS_INSTANCES:-3}
    environment:
      SERVICE_NAME: reviews-service
      CACHE_SERVICE_URL: http://cache-service:3002
      SEARCH_SERVICE_URL: http://search-service:3003
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.reviews.rule=Host(`reviews.localhost`)"
      - "traefik.http.services.reviews.loadbalancer.server.port=3001"
      - "traefik.http.services.reviews.loadbalancer.healthcheck.path=/health"
    networks:
      - app_network
    depends_on:
      - traefik
      - cache-service
      - search-service

  # Cache Service (Single Instance)
  cache-service:
    build:
      context: .
      dockerfile: ./apps/cache-service/Dockerfile
    environment:
      SERVICE_NAME: cache-service
      SEARCH_SERVICE_URL: http://search-service:3003
      CACHE_ADAPTER: ${CACHE_ADAPTER:-redis}
      REDIS_HOST: redis
      DRAGONFLY_HOST: dragonfly
      EVICTION_STRATEGY: ${EVICTION_STRATEGY:-lfu}
      EVICTION_MAX_ENTRIES: ${EVICTION_MAX_ENTRIES:-1000}
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.cache.rule=Host(`cache.localhost`)"
      - "traefik.http.services.cache.loadbalancer.server.port=3002"
    networks:
      - app_network
    depends_on:
      - redis
      - search-service

  # Search Service (Single Instance)
  search-service:
    build:
      context: .
      dockerfile: ./apps/search-service/Dockerfile
    environment:
      SERVICE_NAME: search-service
      MONGO_URI: mongodb://admin:admin@mongodb:27017/daap?authSource=admin
      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.search.rule=Host(`search.localhost`)"
      - "traefik.http.services.search.loadbalancer.server.port=3003"
    networks:
      - app_network
    depends_on:
      - mongodb

  # MongoDB
  mongodb:
    image: mongo:7
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
    ports:
      - "27017:27017"
    volumes:
      - mongodb-data:/data/db
    networks:
      - app_network

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - app_network

  # Dragonfly (Alternative Cache)
  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly:latest
    ports:
      - "6380:6379"
    volumes:
      - dragonfly-data:/data
    networks:
      - app_network

  # Jaeger
  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      COLLECTOR_OTLP_ENABLED: true
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
    networks:
      - app_network

  # Prometheus
  prometheus:
    image: prom/prometheus:latest
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - app_network

  # Grafana
  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks:
      - app_network
    depends_on:
      - prometheus
      - jaeger

  # InfluxDB (for K6 metrics)
  influxdb:
    image: influxdb:1.8
    environment:
      INFLUXDB_DB: k6
    ports:
      - "8086:8086"
    volumes:
      - influxdb-data:/var/lib/influxdb
    networks:
      - app_network

networks:
  app_network:
    driver: bridge

volumes:
  mongodb-data:
  redis-data:
  dragonfly-data:
  prometheus-data:
  grafana-data:
  influxdb-data:
```

## Development Deployment

### Quick Start

```bash
# 1. Clone repository
git clone <repo-url>
cd daap

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env

# 4. Start infrastructure only
docker-compose up -d mongodb redis dragonfly traefik jaeger prometheus grafana

# 5. Build all services
pnpm build

# 6. Start services in development mode (hot reload)
pnpm start:dev
```

### Development Workflow

```mermaid
sequenceDiagram
    participant Dev as Desenvolvedor
    participant Code as Editor de código
    participant Watch as Modo Turbo Watch
    participant Services as Serviços NestJS
    participant Docker as Infra Docker

    Dev->>Code: Editar arquivo TypeScript
    Code->>Watch: Arquivo alterado (detectado)
    Watch->>Watch: Reconstruir pacotes afetados
    Watch->>Services: Recarga em tempo real
    Services->>Docker: Usar MongoDB/Redis
    Docker-->>Services: Dados
    Services-->>Dev: Alterações visíveis em http://reviews.localhost
```

**Benefits**:
- **Hot Reload**: Changes reflected without restarting containers
- **Fast Iteration**: TypeScript incremental compilation
- **Shared Infra**: Use Docker for databases, code runs locally

### Development Environment Variables

```bash
# .env (development)
NODE_ENV=development

# Service URLs (localhost for local dev)
REVIEWS_SERVICE_URL=http://localhost:3001
CACHE_SERVICE_URL=http://localhost:3002
SEARCH_SERVICE_URL=http://localhost:3003

# Database (Docker)
MONGO_URI=mongodb://admin:admin@localhost:27017/daap?authSource=admin

# Cache Backend
CACHE_ADAPTER=redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Eviction Strategy
EVICTION_STRATEGY=lfu
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_TRACES_SAMPLER=always_on  # 100% sampling for dev

# Logging
LOG_LEVEL=debug
```

## Production Deployment

### Production Architecture

```mermaid
graph TB
    subgraph "Internet"
        Users[Usuários]
    end

    subgraph "Balanceador de carga (Cloud LB ou Traefik)"
        LB[Balanceador de carga<br/>Terminação TLS]
    end

    subgraph "Host Docker (VM na nuvem ou bare metal)"
        subgraph "Camada de aplicação"
            Reviews1[reviews-service-1]
            Reviews2[reviews-service-2]
            Reviews3[reviews-service-3]
            ReviewsN[reviews-service-N]
            Cache[cache-service]
            Search[search-service]
        end

        subgraph "Camada de dados (hosts separados recomendados)"
            MongoDB[MongoDB<br/>Conjunto de réplicas]
            Redis[Redis<br/>Cluster ou Sentinel]
        end

        subgraph "Camada de observabilidade"
            Jaeger[Jaeger<br/>com armazenamento persistente]
            Prometheus[Prometheus<br/>com armazenamento persistente]
            Grafana[Grafana]
        end
    end

    Users --> LB
    LB --> Reviews1
    LB --> Reviews2
    LB --> Reviews3
    LB --> ReviewsN

    Reviews1 --> Cache
    Reviews2 --> Cache
    Reviews3 --> Cache
    ReviewsN --> Cache

    Cache --> Search
    Cache --> Redis

    Search --> MongoDB

    Reviews1 -.-> Jaeger
    Reviews2 -.-> Jaeger
    Reviews3 -.-> Jaeger
    Cache -.-> Jaeger
    Search -.-> Jaeger

    Reviews1 -.-> Prometheus
    Reviews2 -.-> Prometheus
    Cache -.-> Prometheus
    Search -.-> Prometheus

    Prometheus --> Grafana
    Jaeger --> Grafana

    style Users fill:#e1f5ff
    style LB fill:#ffe1e1
    style Reviews1 fill:#e1ffe1
    style Reviews2 fill:#e1ffe1
    style Reviews3 fill:#e1ffe1
    style ReviewsN fill:#e1ffe1
    style Cache fill:#fff4e1
    style Search fill:#f4e1ff
    style MongoDB fill:#e1e1ff
    style Redis fill:#ffe1f4
```

### Production Checklist

- [ ] **TLS/HTTPS**: Enable Let's Encrypt in Traefik or use cloud LB
- [ ] **Environment Variables**: Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- [ ] **Database**: Deploy MongoDB replica set (not single instance)
- [ ] **Cache**: Deploy Redis Cluster or Sentinel for high availability
- [ ] **Persistent Storage**: Use cloud volumes (AWS EBS, GCP Persistent Disk) for data
- [ ] **Monitoring**: Configure Prometheus retention and alerting
- [ ] **Tracing**: Use Jaeger with Elasticsearch/Cassandra backend (not in-memory)
- [ ] **Logging**: Centralized logging (ELK, CloudWatch, Datadog)
- [ ] **Backups**: Automated MongoDB backups
- [ ] **Resource Limits**: Set CPU/memory limits in docker-compose.yml
- [ ] **Health Checks**: Configure readiness/liveness probes
- [ ] **Scaling**: Auto-scaling based on metrics
- [ ] **Security**: Non-root containers, network policies, secrets rotation

### Production docker-compose.yml

**Key Changes**:

```yaml
services:
  reviews-service:
    deploy:
      replicas: ${REVIEWS_INSTANCES:-5}  # Higher replicas
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
      restart_policy:
        condition: on-failure
        max_attempts: 3

  mongodb:
    # Use managed MongoDB (MongoDB Atlas) or replica set
    image: mongo:7
    command: --replSet rs0
    volumes:
      - /mnt/data/mongodb:/data/db  # Persistent volume

  redis:
    # Use managed Redis (ElastiCache) or Redis Cluster
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - /mnt/data/redis:/data

  jaeger:
    # Use Jaeger with persistent backend
    environment:
      SPAN_STORAGE_TYPE: elasticsearch
      ES_SERVER_URLS: http://elasticsearch:9200
    depends_on:
      - elasticsearch

  prometheus:
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'  # 30-day retention
    volumes:
      - /mnt/data/prometheus:/prometheus
```

### Production Environment Variables

```bash
# .env.production
NODE_ENV=production

# Service URLs (internal Docker DNS)
REVIEWS_SERVICE_URL=http://reviews-service:3001
CACHE_SERVICE_URL=http://cache-service:3002
SEARCH_SERVICE_URL=http://search-service:3003

# Database (managed service or replica set)
MONGO_URI=mongodb://user:pass@mongodb-1:27017,mongodb-2:27017,mongodb-3:27017/daap?replicaSet=rs0&authSource=admin

# Cache Backend (managed Redis or cluster)
CACHE_ADAPTER=redis
REDIS_HOST=redis-cluster-endpoint
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}  # From secrets manager

# Eviction Strategy (tuned for production)
EVICTION_STRATEGY=hybrid
EVICTION_MAX_ENTRIES=5000  # Higher capacity
EVICTION_BATCH_SIZE=100
EVICTION_FREQUENCY_WEIGHT=0.6
EVICTION_RECENCY_WEIGHT=0.4

# Cache Optimization
ENABLE_FUZZY_CACHE=true
FUZZY_SIMILARITY_THRESHOLD=0.7
FUZZY_MAX_CANDIDATES=20

# OpenTelemetry (reduced sampling)
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling

# Logging
LOG_LEVEL=info  # Not debug
```

### Deployment Commands

```bash
# 1. Pull latest images
docker-compose pull

# 2. Build services
docker-compose build --no-cache

# 3. Deploy with specific replicas
REVIEWS_INSTANCES=5 docker-compose up -d

# 4. Verify deployment
docker ps
docker-compose logs -f

# 5. Health check
curl http://reviews.localhost/health
curl http://cache.localhost/health
curl http://search.localhost/health
```

## Scaling Strategy

### Horizontal Scaling (Reviews Service)

```mermaid
flowchart TD
    Start([Monitorar carga]) --> CheckCPU{CPU > 70%?}

    CheckCPU -->|Sim| CheckMem{Memória > 80%?}
    CheckCPU -->|Não| Monitor[Continuar monitorando]

    CheckMem -->|Sim| ScaleUp[Escalar Reviews Service]
    CheckMem -->|Não| Monitor

    ScaleUp --> Command[./daap.sh scale 8]

    Command --> Verify[Verificar health checks]

    Verify --> TraefikCheck{Traefik detecta<br/>novas instâncias?}

    TraefikCheck -->|Sim| Success[Tráfego distribuído]
    TraefikCheck -->|Não| Debug[Checar labels do Docker]

    Success --> Monitor
    Debug --> Fix[Ajustar configuração do Traefik]
    Fix --> Command

    style Start fill:#e1f5ff
    style ScaleUp fill:#fff4e1
    style Success fill:#e1ffe1
    style Debug fill:#ffe1e1
```

**Scaling Commands**:

```bash
# Scale to 8 instances
./daap.sh scale 8

# OR manually
docker-compose up -d --scale reviews-service=8

# Verify
docker ps | grep reviews-service
# Should show 8 containers

# Check Traefik dashboard
curl http://localhost:8080/api/http/services/reviews@docker
```

**When to Scale**:
- CPU usage > 70% sustained for 5+ minutes
- Memory usage > 80%
- Response time P95 > 500ms
- Request rate > 1000 req/s per instance

**Auto-Scaling** (requires orchestrator like Kubernetes):
```yaml
# Kubernetes HPA example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: reviews-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: reviews-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Vertical Scaling (Cache/Database)

**Cache Service** (cannot scale horizontally):

```bash
# Increase memory allocation
docker-compose up -d --scale cache-service=1 --memory 2g cache-service

# Increase max cache entries
EVICTION_MAX_ENTRIES=10000 docker-compose up -d cache-service
```

**Redis Scaling**:

```bash
# Option 1: Increase maxmemory
docker exec daap-redis redis-cli CONFIG SET maxmemory 4gb

# Option 2: Use Redis Cluster (multiple nodes)
# Requires redis-cluster Docker Compose configuration

# Option 3: Use managed Redis (ElastiCache, Redis Enterprise)
```

**MongoDB Scaling**:

```bash
# Option 1: Add replica set members
# Requires MongoDB replica set configuration

# Option 2: Enable sharding
# For datasets > 100GB

# Option 3: Use managed MongoDB (Atlas)
```

## Configuration Management

### Environment Variable Hierarchy

```mermaid
flowchart TD
    Defaults[Valores padrão<br/>no código] --> EnvFile[Arquivo .env]

    EnvFile --> DockerEnv[Docker Compose<br/>bloco environment:]

    DockerEnv --> ShellEnv[Variáveis de ambiente<br/>do shell]

    ShellEnv --> Secrets[Gerenciador de segredos<br/>AWS/Vault]

    Secrets --> Runtime[Configuração em runtime]

    style Defaults fill:#e1e1ff
    style EnvFile fill:#fff4e1
    style DockerEnv fill:#e1ffe1
    style ShellEnv fill:#f4e1ff
    style Secrets fill:#ffe1e1
    style Runtime fill:#e1f5ff
```

**Priority** (highest to lowest):
1. Secrets Manager (production)
2. Shell environment variables
3. docker-compose.yml `environment:` section
4. `.env` file
5. Default values in code

### Secrets Management

**Development** (`.env` file):
```bash
# .env
REDIS_PASSWORD=dev_password_123
MONGO_PASSWORD=admin
```

**Production** (AWS Secrets Manager):

```bash
# Fetch secrets at runtime
export REDIS_PASSWORD=$(aws secretsmanager get-secret-value --secret-id daap/redis/password --query SecretString --output text)
export MONGO_PASSWORD=$(aws secretsmanager get-secret-value --secret-id daap/mongo/password --query SecretString --output text)

# Then deploy
docker-compose up -d
```

**docker-compose.yml with secrets**:
```yaml
services:
  cache-service:
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}  # Injected from shell
```

## Health Checks

### Service Health Endpoints

All services expose `/health` endpoint:

```typescript
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      timestamp: Date.now(),
      service: process.env.SERVICE_NAME,
    };
  }
}
```

### Docker Health Checks

```yaml
services:
  reviews-service:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Traefik Health Checks

```yaml
labels:
  - "traefik.http.services.reviews.loadbalancer.healthcheck.path=/health"
  - "traefik.http.services.reviews.loadbalancer.healthcheck.interval=10s"
  - "traefik.http.services.reviews.loadbalancer.healthcheck.timeout=3s"
```

**Behavior**:
- Traefik polls `/health` every 10 seconds
- If 3 consecutive failures → instance marked unhealthy
- Unhealthy instances removed from load balancer
- Automatically re-added when healthy

## Monitoring & Alerting

### Prometheus Alerts

**Location**: Create `prometheus/alerts.yml`

```yaml
groups:
  - name: daap_alerts
    interval: 30s
    rules:
      # High cache miss rate
      - alert: HighCacheMissRate
        expr: |
          rate(cache_misses_total[5m]) /
          (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) > 0.3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Cache miss rate above 30%"
          description: "Cache is ineffective, consider increasing max entries"

      # Slow evictions
      - alert: SlowEvictions
        expr: histogram_quantile(0.95, rate(eviction_duration_ms_bucket[5m])) > 500
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Eviction P95 latency > 500ms"
          description: "Consider reducing batch size or optimizing eviction strategy"

      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate"
          description: "More than 10 errors per second"

      # Service down
      - alert: ServiceDown
        expr: up{job="reviews-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Reviews Service is down"
          description: "All instances are unhealthy"
```

### Grafana Alerts

**Dashboard Panel Alert**:

```json
{
  "alert": {
    "name": "Cache Hit Rate Too Low",
    "conditions": [
      {
        "evaluator": {
          "params": [80],
          "type": "lt"
        },
        "query": {
          "model": "rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) * 100"
        }
      }
    ],
    "frequency": "1m",
    "handler": 1,
    "notifications": [
      {
        "uid": "slack-channel"
      }
    ]
  }
}
```

### Alert Notification Channels

**Slack**:
```bash
# Grafana → Configuration → Notification channels → Add channel
Type: Slack
Webhook URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Email**:
```bash
# prometheus.yml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

## Next Steps

- [Testing Strategy](./07-testing.md) - Load testing and performance validation
- [Architecture Overview](./01-architecture-overview.md) - System design principles
