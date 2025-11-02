# Network Topology

## Table of Contents
- [Overview](#overview)
- [Docker Network Architecture](#docker-network-architecture)
- [Service Discovery](#service-discovery)
- [Port Mappings](#port-mappings)
- [Traefik Routing](#traefik-routing)
- [Internal Communication](#internal-communication)
- [External Access](#external-access)

## Overview

The DAAP system uses **Docker Compose** for container orchestration with a **bridge network** for inter-service communication. All services run on a single Docker network (`app_network`) with **Traefik** as the load balancer and reverse proxy.

## Docker Network Architecture

```mermaid
graph TB
    subgraph "Rede Externa"
        Internet([Internet/Localhost])
    end

    subgraph "Rede Docker: app_network (172.18.0.0/16)"
        subgraph "Balanceador de Carga"
            Traefik[Traefik<br/>172.18.0.2<br/>Portas: 80, 443, 8080]
        end

        subgraph "Microserviços"
            Reviews1[reviews-service-1<br/>172.18.0.10<br/>Porta 3001]
            Reviews2[reviews-service-2<br/>172.18.0.11<br/>Porta 3001]
            ReviewsN[reviews-service-N<br/>172.18.0.1X<br/>Porta 3001]

            Cache[cache-service<br/>172.18.0.20<br/>Porta 3002]
            Search[search-service<br/>172.18.0.30<br/>Porta 3003]
        end

        subgraph "Armazenamento de Dados"
            MongoDB[mongodb<br/>172.18.0.40<br/>Porta 27017]
            Redis[redis<br/>172.18.0.41<br/>Porta 6379]
            Dragonfly[dragonfly<br/>172.18.0.42<br/>Porta 6379 interno]
        end

        subgraph "Observabilidade"
            Jaeger[jaeger<br/>172.18.0.50<br/>Portas: 16686, 4317, 4318]
            Prometheus[prometheus<br/>172.18.0.51<br/>Porta 9090]
            Grafana[grafana<br/>172.18.0.52<br/>Porta 3000]
            InfluxDB[influxdb<br/>172.18.0.53<br/>Porta 8086]
        end
    end

    Internet -->|HTTP :80| Traefik
    Internet -->|HTTPS :443| Traefik
    Internet -->|Dashboard :8080| Traefik
    Internet -->|Jaeger UI :16686| Jaeger
    Internet -->|Prometheus :9090| Prometheus
    Internet -->|Grafana :3000| Grafana
    Internet -->|MongoDB :27017| MongoDB
    Internet -->|Redis :6379| Redis
    Internet -->|Dragonfly :6380| Dragonfly
    Internet -->|InfluxDB :8086| InfluxDB

    Traefik -.->|reviews.localhost| Reviews1
    Traefik -.->|Round-robin| Reviews2
    Traefik -.->|Balanceamento| ReviewsN

    Traefik -.->|cache.localhost| Cache
    Traefik -.->|search.localhost| Search

    Reviews1 -->|http://cache-service:3002| Cache
    Reviews2 -->|http://cache-service:3002| Cache
    ReviewsN -->|http://cache-service:3002| Cache

    Reviews1 -.->|Fallback| Search
    Reviews2 -.->|Fallback| Search
    ReviewsN -.->|Fallback| Search

    Cache -->|http://search-service:3003| Search
    Cache -->|redis://redis:6379| Redis
    Cache -.->|Alternativa| Dragonfly

    Search -->|mongodb://mongodb:27017| MongoDB

    Reviews1 -.->|OTLP gRPC :4317| Jaeger
    Reviews2 -.->|OTLP gRPC :4317| Jaeger
    ReviewsN -.->|OTLP gRPC :4317| Jaeger
    Cache -.->|OTLP gRPC :4317| Jaeger
    Search -.->|OTLP gRPC :4317| Jaeger

    Reviews1 -.->|Métricas :9464| Prometheus
    Reviews2 -.->|Métricas :9464| Prometheus
    ReviewsN -.->|Métricas :9464| Prometheus
    Cache -.->|Métricas :9464| Prometheus
    Search -.->|Métricas :9464| Prometheus

    style Internet fill:#e1f5ff
    style Traefik fill:#ffe1e1
    style Reviews1 fill:#e1ffe1
    style Reviews2 fill:#e1ffe1
    style ReviewsN fill:#e1ffe1
    style Cache fill:#fff4e1
    style Search fill:#f4e1ff
    style MongoDB fill:#e1e1ff
    style Redis fill:#ffe1f4
    style Dragonfly fill:#ffe1f4
    style Jaeger fill:#f4ffe1
    style Prometheus fill:#f4ffe1
    style Grafana fill:#f4ffe1
    style InfluxDB fill:#e1e1ff
```

### Network Configuration

**Docker Network**: `app_network` (bridge driver)

```yaml
networks:
  app_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.18.0.0/16
```

**Characteristics**:
- **Type**: Bridge network (isolated from host)
- **Subnet**: 172.18.0.0/16 (65,534 possible IP addresses)
- **DNS**: Automatic service name resolution (e.g., `cache-service` → IP)
- **Isolation**: Services cannot communicate outside this network (except exposed ports)

## Service Discovery

Docker provides built-in DNS resolution for container names:

```mermaid
flowchart LR
    subgraph "Reviews Service Container"
        App[Application Code]
    end

    subgraph "Docker DNS Resolver"
        DNS[Docker DNS<br/>127.0.0.11:53]
    end

    subgraph "Cache Service Container"
        Cache[cache-service<br/>172.18.0.20]
    end

    App -->|1. Resolver<br/>"cache-service"| DNS
    DNS -->|2. Retornar<br/>172.18.0.20| App
    App -->|3. Requisição HTTP<br/>http://cache-service:3002| Cache

    style App fill:#e1ffe1
    style DNS fill:#ffe1e1
    style Cache fill:#fff4e1
```

### Service Name Resolution

**Internal Service URLs** (used in code):
```bash
# Reviews Service calls Cache Service
http://cache-service:3002/cache/search

# Cache Service calls Search Service
http://search-service:3003/search

# Services connect to MongoDB
mongodb://mongodb:27017/daap

# Services connect to Redis
redis://redis:6379

# Services send traces to Jaeger
http://jaeger:4317  # OTLP gRPC
```

**Why not use IP addresses?**
- IPs are dynamic (change on container restart)
- Service names are stable and human-readable
- Docker DNS updates automatically

## Port Mappings

### Complete Port Reference

```mermaid
graph LR
    subgraph "Host Machine (localhost)"
        Host80[Port 80<br/>HTTP]
        Host443[Port 443<br/>HTTPS]
        Host8080[Port 8080<br/>Traefik UI]
        Host27017[Port 27017<br/>MongoDB]
        Host6379[Port 6379<br/>Redis]
        Host6380[Port 6380<br/>Dragonfly]
        Host16686[Port 16686<br/>Jaeger UI]
        Host4317[Port 4317<br/>Jaeger OTLP]
        Host9090[Port 9090<br/>Prometheus]
        Host3000[Port 3000<br/>Grafana]
        Host8086[Port 8086<br/>InfluxDB]
    end

    subgraph "Docker Containers (app_network)"
        Traefik80[Traefik<br/>Port 80]
        Traefik443[Traefik<br/>Port 443]
        Traefik8080[Traefik<br/>Port 8080]
        MongoDB[MongoDB<br/>Port 27017]
        Redis[Redis<br/>Port 6379]
        Dragonfly[Dragonfly<br/>Port 6379]
        Jaeger16686[Jaeger<br/>Port 16686]
        Jaeger4317[Jaeger<br/>Port 4317]
        Prometheus9090[Prometheus<br/>Port 9090]
        Grafana3000[Grafana<br/>Port 3000]
        InfluxDB8086[InfluxDB<br/>Port 8086]

        Reviews[Reviews Service<br/>Port 3001<br/>NOT exposed]
        Cache[Cache Service<br/>Port 3002<br/>NOT exposed]
        Search[Search Service<br/>Port 3003<br/>NOT exposed]
    end

    Host80 -.->|Bind| Traefik80
    Host443 -.->|Bind| Traefik443
    Host8080 -.->|Bind| Traefik8080
    Host27017 -.->|Bind| MongoDB
    Host6379 -.->|Bind| Redis
    Host6380 -.->|Bind| Dragonfly
    Host16686 -.->|Bind| Jaeger16686
    Host4317 -.->|Bind| Jaeger4317
    Host9090 -.->|Bind| Prometheus9090
    Host3000 -.->|Bind| Grafana3000
    Host8086 -.->|Bind| InfluxDB8086

    Traefik80 -->|Proxy| Reviews
    Traefik80 -->|Proxy| Cache
    Traefik80 -->|Proxy| Search

    style Host80 fill:#e1f5ff
    style Host443 fill:#e1f5ff
    style Host8080 fill:#e1f5ff
    style Traefik80 fill:#ffe1e1
    style Traefik443 fill:#ffe1e1
    style Traefik8080 fill:#ffe1e1
    style Reviews fill:#e1ffe1
    style Cache fill:#fff4e1
    style Search fill:#f4e1ff
```

### Port Mapping Table

| Service | Container Port | Host Port | Protocol | Purpose | Exposed? |
|---------|----------------|-----------|----------|---------|----------|
| **Load Balancer** |
| Traefik | 80 | 80 | HTTP | Web traffic | Yes |
| Traefik | 443 | 443 | HTTPS | Secure web traffic | Yes |
| Traefik | 8080 | 8080 | HTTP | Dashboard | Yes |
| **Microservices** |
| Reviews Service | 3001 | - | HTTP | API | No (via Traefik) |
| Cache Service | 3002 | - | HTTP | Cache API | No (via Traefik) |
| Search Service | 3003 | - | HTTP | Search API | No (via Traefik) |
| **Data Stores** |
| MongoDB | 27017 | 27017 | MongoDB | Database | Yes |
| Redis | 6379 | 6379 | Redis | Cache backend | Yes |
| Dragonfly | 6379 | 6380 | Redis | Cache backend | Yes |
| **Observability** |
| Jaeger (UI) | 16686 | 16686 | HTTP | Trace visualization | Yes |
| Jaeger (OTLP gRPC) | 4317 | 4317 | gRPC | Trace ingestion | Yes |
| Jaeger (OTLP HTTP) | 4318 | 4318 | HTTP | Trace ingestion | Yes |
| Jaeger (Collector) | 14250 | - | gRPC | Legacy collector | No |
| Prometheus | 9090 | 9090 | HTTP | Metrics query | Yes |
| Grafana | 3000 | 3000 | HTTP | Dashboards | Yes |
| InfluxDB | 8086 | 8086 | HTTP | K6 metrics | Yes |

### Why Microservices Aren't Directly Exposed

**Security & Routing**:
1. **Single Entry Point**: All HTTP traffic goes through Traefik
2. **Host-based Routing**: Traefik routes based on hostname
3. **Load Balancing**: Traefik distributes traffic across multiple Reviews Service instances
4. **TLS Termination**: HTTPS handled by Traefik, services use plain HTTP internally
5. **Reduced Attack Surface**: Services not accessible from host directly

**Access Pattern**:
```bash
# ❌ WRONG - Services not exposed on host
curl http://localhost:3001/search

# ✅ CORRECT - Access via Traefik with hostname
curl http://reviews.localhost/search

# OR use Traefik's IP directly with Host header
curl -H "Host: reviews.localhost" http://localhost/search
```

## Traefik Routing

Traefik uses **Docker labels** for automatic service discovery:

```mermaid
flowchart TD
    User[Requisição do usuário<br/>http://reviews.localhost/search]

    Traefik{Roteador Traefik}

    Reviews1[reviews-service-1<br/>172.18.0.10:3001]
    Reviews2[reviews-service-2<br/>172.18.0.11:3001]
    ReviewsN[reviews-service-N<br/>172.18.0.1X:3001]

    Cache[cache-service<br/>172.18.0.20:3002]
    Search[search-service<br/>172.18.0.30:3003]

    User -->|1. Requisição HTTP<br/>Host: reviews.localhost| Traefik

    Traefik -->|2. Correspondência<br/>Regra: Host(`reviews.localhost`)| LB{Balanceador de carga<br/>Round-Robin}

    LB -->|3a. Rota| Reviews1
    LB -->|3b. Rota| Reviews2
    LB -->|3c. Rota| ReviewsN

    User2[Requisição do usuário<br/>http://cache.localhost/cache/stats]
    User2 -->|Host: cache.localhost| Traefik
    Traefik -->|Regra: Host(`cache.localhost`)| Cache

    User3[Requisição do usuário<br/>http://search.localhost/search]
    User3 -->|Host: search.localhost| Traefik
    Traefik -->|Regra: Host(`search.localhost`)| Search

    style User fill:#e1f5ff
    style User2 fill:#e1f5ff
    style User3 fill:#e1f5ff
    style Traefik fill:#ffe1e1
    style LB fill:#ffe1e1
    style Reviews1 fill:#e1ffe1
    style Reviews2 fill:#e1ffe1
    style ReviewsN fill:#e1ffe1
    style Cache fill:#fff4e1
    style Search fill:#f4e1ff
```

### Traefik Configuration

**Static Configuration** ([traefik.yml](../traefik.yml)):
```yaml
entryPoints:
  web:
    address: ":80"       # HTTP
  websecure:
    address: ":443"      # HTTPS

api:
  dashboard: true
  insecure: true         # Dashboard on :8080 (dev only)

providers:
  docker:
    exposedByDefault: false  # Require explicit labels
    network: app_network
```

**Dynamic Configuration** (Docker labels in docker-compose.yml):

```yaml
# Reviews Service
services:
  reviews-service:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.reviews.rule=Host(`reviews.localhost`)"
      - "traefik.http.routers.reviews.entrypoints=web"
      - "traefik.http.services.reviews.loadbalancer.server.port=3001"
      - "traefik.http.services.reviews.loadbalancer.healthcheck.path=/health"
      - "traefik.http.services.reviews.loadbalancer.healthcheck.interval=10s"

# Cache Service
  cache-service:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.cache.rule=Host(`cache.localhost`)"
      - "traefik.http.routers.cache.entrypoints=web"
      - "traefik.http.services.cache.loadbalancer.server.port=3002"

# Search Service
  search-service:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.search.rule=Host(`search.localhost`)"
      - "traefik.http.routers.search.entrypoints=web"
      - "traefik.http.services.search.loadbalancer.server.port=3003"
```

### Health Checks

Traefik automatically monitors service health:

```yaml
traefik.http.services.reviews.loadbalancer.healthcheck.path=/health
traefik.http.services.reviews.loadbalancer.healthcheck.interval=10s
traefik.http.services.reviews.loadbalancer.healthcheck.timeout=3s
```

**Health Check Endpoint** (all services):
```typescript
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', timestamp: Date.now() };
  }
}
```

**Behavior**:
- Traefik polls `/health` every 10 seconds
- If service returns non-2xx or times out → marked unhealthy
- Unhealthy instances removed from load balancer rotation
- Automatically re-added when health check passes

## Internal Communication

All inter-service communication uses Docker DNS names:

```mermaid
sequenceDiagram
    participant R as reviews-service
    participant DNS as Docker DNS
    participant C as cache-service
    participant S as search-service
    participant M as mongodb

    Note over R: Need to call Cache Service

    R->>DNS: Resolve "cache-service"
    DNS-->>R: 172.18.0.20

    R->>C: HTTP GET http://cache-service:3002/cache/search
    activate C

    Note over C: Need to call Search Service

    C->>DNS: Resolve "search-service"
    DNS-->>C: 172.18.0.30

    C->>S: HTTP GET http://search-service:3003/search
    activate S

    Note over S: Need to query MongoDB

    S->>DNS: Resolve "mongodb"
    DNS-->>S: 172.18.0.40

    S->>M: MongoDB query: mongodb://mongodb:27017/daap
    activate M
    M-->>S: Results
    deactivate M

    S-->>C: JSON response
    deactivate S

    C-->>R: JSON response
    deactivate C
```

### HTTP Communication Pattern

**Service-to-Service HTTP**:
```typescript
// Reviews Service → Cache Service
const response = await axios.get(
  `${process.env.CACHE_SERVICE_URL}/cache/search`,
  { params: { q: 'laptop', page: 1, size: 10 } }
);

// CACHE_SERVICE_URL = http://cache-service:3002
```

**Key Points**:
- Use **service names**, not IPs
- Use **internal ports** (3001, 3002, 3003), not exposed ports
- Docker handles DNS resolution automatically
- Network latency: ~1-2ms (same host) vs ~0.1ms (localhost)

### Database Connections

**MongoDB**:
```typescript
MongooseModule.forRoot('mongodb://mongodb:27017/daap', {
  auth: {
    username: 'admin',
    password: 'admin',
  },
  authSource: 'admin',
});
```

**Redis**:
```typescript
const redis = new Redis({
  host: 'redis',   // Docker service name
  port: 6379,
  maxRetriesPerRequest: 3,
});
```

**Dragonfly** (Redis-compatible):
```typescript
const redis = new Redis({
  host: 'dragonfly',
  port: 6379,  // Internal port (exposed as 6380 on host)
});
```

## External Access

How users and developers access services:

```mermaid
flowchart TD
    subgraph "Usuários externos"
        Browser[Navegador web]
        CLI[curl/Postman]
        LoadTest[Ferramentas de teste de carga]
    end

    subgraph "Acesso do desenvolvedor"
        DevMongoDB[Cliente MongoDB<br/>Studio 3T, Compass]
        DevRedis[Cliente Redis<br/>RedisInsight, CLI]
        DevJaeger[Jaeger UI<br/>Navegador web]
        DevPrometheus[Prometheus<br/>Navegador web]
        DevGrafana[Grafana<br/>Navegador web]
    end

    subgraph "Docker Network (app_network)"
        Traefik[Traefik<br/>:80, :443, :8080]
        MongoDB[MongoDB<br/>:27017]
        Redis[Redis<br/>:6379]
        Jaeger[Jaeger<br/>:16686]
        Prometheus[Prometheus<br/>:9090]
        Grafana[Grafana<br/>:3000]

        Reviews[Reviews Service]
        Cache[Cache Service]
        Search[Search Service]
    end

    Browser -->|http://reviews.localhost| Traefik
    CLI -->|http://cache.localhost| Traefik
    LoadTest -->|http://search.localhost| Traefik

    Traefik --> Reviews
    Traefik --> Cache
    Traefik --> Search

    DevMongoDB -->|localhost:27017| MongoDB
    DevRedis -->|localhost:6379| Redis
    DevJaeger -->|localhost:16686| Jaeger
    DevPrometheus -->|localhost:9090| Prometheus
    DevGrafana -->|localhost:3000| Grafana

    style Browser fill:#e1f5ff
    style CLI fill:#e1f5ff
    style LoadTest fill:#e1f5ff
    style DevMongoDB fill:#ffe1f4
    style DevRedis fill:#ffe1f4
    style DevJaeger fill:#f4ffe1
    style DevPrometheus fill:#f4ffe1
    style DevGrafana fill:#f4ffe1
    style Traefik fill:#ffe1e1
```

### Access URLs

**API Endpoints** (via Traefik):
```bash
# Reviews Service (main entry point)
http://reviews.localhost/search?q=laptop&page=1&size=10
http://reviews.localhost/health

# Cache Service (stats and management)
http://cache.localhost/cache/search?q=laptop
http://cache.localhost/cache/stats/keywords?limit=50
http://cache.localhost/cache/stats/info
http://cache.localhost/cache/metrics/hit-types

# Search Service (direct MongoDB access)
http://search.localhost/search?q=laptop
http://search.localhost/health
```

**Observability UIs**:
```bash
# Traefik Dashboard
http://localhost:8080/dashboard/

# Jaeger Tracing UI
http://localhost:16686

# Prometheus Query UI
http://localhost:9090

# Grafana Dashboards
http://localhost:3000
# Credentials: admin / admin
```

**Database Connections**:
```bash
# MongoDB (via MongoDB Compass or CLI)
mongodb://admin:admin@localhost:27017/daap?authSource=admin

# Redis (via redis-cli)
redis-cli -h localhost -p 6379

# Dragonfly (via redis-cli)
redis-cli -h localhost -p 6380
```

### `/etc/hosts` Configuration

For `*.localhost` domains to work:

**macOS/Linux**:
```bash
# Usually works by default (*.localhost → 127.0.0.1)
# If not, add to /etc/hosts:
127.0.0.1 reviews.localhost
127.0.0.1 cache.localhost
127.0.0.1 search.localhost
```

**Windows**:
```
# Add to C:\Windows\System32\drivers\etc\hosts
127.0.0.1 reviews.localhost
127.0.0.1 cache.localhost
127.0.0.1 search.localhost
```

## Scaling Considerations

### Horizontal Scaling (Reviews Service)

```yaml
# docker-compose.yml
services:
  reviews-service:
    deploy:
      replicas: ${REVIEWS_INSTANCES:-3}  # Default 3 instances
```

**Scaling Commands**:
```bash
# Scale to 5 instances
./daap.sh scale 5

# OR manually
docker-compose up -d --scale reviews-service=5

# Verify
docker ps | grep reviews-service
```

**Traefik Behavior**:
- Automatically discovers all instances
- Round-robin load balancing
- Health checks per instance
- Removes unhealthy instances from pool

### Stateful Services (No Horizontal Scaling)

**Cache Service**: Cannot scale horizontally
- Stores cache state in Redis
- Multiple instances would cause cache inconsistency
- Solution: Scale Redis/Dragonfly (clustering)

**Search Service**: Cannot scale horizontally (currently)
- MongoDB connection is stateless
- Could be scaled with proper connection pooling
- MongoDB handles scale via replica sets/sharding

## Network Security

### Isolation Principles

```mermaid
graph TB
    subgraph "External Network (Untrusted)"
        Internet([Internet])
    end

    subgraph "Docker Bridge Network: app_network (Trusted)"
        Traefik[Traefik<br/>Reverse Proxy]

        subgraph "Service Layer (Internal Only)"
            Reviews[Reviews Service]
            Cache[Cache Service]
            Search[Search Service]
        end

        subgraph "Data Layer (Internal Only)"
            MongoDB[(MongoDB)]
            Redis[(Redis)]
        end
    end

    Internet -->|Only via :80, :443| Traefik
    Internet -.->|Blocked| Reviews
    Internet -.->|Blocked| Cache
    Internet -.->|Blocked| Search

    Traefik -->|Allowed| Reviews
    Traefik -->|Allowed| Cache
    Traefik -->|Allowed| Search

    Reviews -->|Allowed| Cache
    Reviews -->|Allowed| Search
    Cache -->|Allowed| Search
    Cache -->|Allowed| Redis
    Search -->|Allowed| MongoDB

    style Internet fill:#ffe1e1
    style Traefik fill:#fff4e1
    style Reviews fill:#e1ffe1
    style Cache fill:#e1ffe1
    style Search fill:#e1ffe1
    style MongoDB fill:#e1e1ff
    style Redis fill:#e1e1ff
```

### Security Features

1. **No Direct Service Exposure**:
   - Microservices only accessible via Traefik
   - Host cannot access services directly on ports 3001-3003

2. **Network Isolation**:
   - All services on isolated bridge network
   - No external communication (except exposed ports)

3. **Database Security**:
   - MongoDB: Authentication required (`admin/admin` for dev)
   - Redis: No authentication (internal network only)

4. **TLS (Production)**:
   - Traefik handles HTTPS (Let's Encrypt integration)
   - Internal traffic uses HTTP (trusted network)

## Troubleshooting Network Issues

### Service Cannot Resolve Hostname

**Symptom**: `Error: getaddrinfo ENOTFOUND cache-service`

**Diagnosis**:
```bash
# Check if service is running
docker ps | grep cache-service

# Check if service is on app_network
docker inspect daap-cache-service | grep -A 10 Networks

# Test DNS resolution from another container
docker exec daap-reviews-service nslookup cache-service
docker exec daap-reviews-service ping cache-service
```

**Fix**: Ensure service is on correct network in docker-compose.yml:
```yaml
services:
  cache-service:
    networks:
      - app_network
```

### Cannot Access via `*.localhost`

**Symptom**: `curl http://reviews.localhost` → Connection refused

**Diagnosis**:
```bash
# Check Traefik is running
docker ps | grep traefik

# Check Traefik logs
docker logs daap-traefik

# Verify routing rules
curl http://localhost:8080/api/http/routers

# Test with direct IP
curl -H "Host: reviews.localhost" http://localhost/search
```

**Fix**: Check Traefik labels on service:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.reviews.rule=Host(`reviews.localhost`)"
```

### Port Already in Use

**Symptom**: `Error: bind: address already in use`

**Diagnosis**:
```bash
# Find process using port (macOS/Linux)
sudo lsof -i :80
sudo lsof -i :6379

# Kill process or change port in docker-compose.yml
```

### Network Latency Issues

**Symptom**: Slow inter-service communication

**Diagnosis**:
```bash
# Test latency between containers
docker exec daap-reviews-service time curl http://cache-service:3002/health

# Check container resource usage
docker stats

# Inspect network
docker network inspect app_network
```

## Next Steps

- [Cache Strategies](./04-cache-strategies.md) - Eviction algorithms and optimization
- [Observability](./05-observability.md) - Distributed tracing and metrics
- [Deployment Guide](./06-deployment.md) - Production deployment patterns
