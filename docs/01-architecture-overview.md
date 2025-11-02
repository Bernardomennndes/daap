# Architecture Overview

## Table of Contents
- [Introduction](#introduction)
- [System Architecture](#system-architecture)
- [Design Principles](#design-principles)
- [Technology Stack](#technology-stack)
- [Service Inventory](#service-inventory)

## Introduction

DAAP (Distributed Application Architecture Project) is a university project demonstrating a **distributed microservices architecture** with **intelligent cache eviction strategies**. The system implements a search engine for product reviews with a custom cache layer that achieves **99.9% performance improvement** (8ms vs 7580ms average response time).

### Key Innovation
- **Keyword-based cache tracking** with pluggable backends (Redis/Dragonfly)
- **Three pluggable eviction strategies** (LFU, LRU, Hybrid)
- **Fuzzy matching** for cache optimization (+35% hit rate)
- **Distributed tracing** with OpenTelemetry and Jaeger
- **Resilient fallback chains** for high availability

## System Architecture

```mermaid
graph TB
    subgraph "Camada de Usuário"
        User[Usuário/Cliente]
    end

    subgraph "Balanceador de Carga"
        Traefik[Traefik<br/>Porta 80/443/8080]
    end

    subgraph "Camada de Microserviços"
        Reviews[Reviews Service<br/>Porta 3001<br/>API Gateway]
        Cache[Cache Service<br/>Porta 3002<br/>Orquestração de Cache]
        Search[Search Service<br/>Porta 3003<br/>Backend MongoDB]
    end

    subgraph "Camada de Dados"
        MongoDB[(MongoDB<br/>Porta 27017<br/>Banco de Reviews)]
        Redis[(Redis<br/>Porta 6379<br/>Backend de Cache)]
        Dragonfly[(Dragonfly<br/>Porta 6380<br/>Cache Alternativo)]
    end

    subgraph "Camada de Observabilidade"
        Jaeger[Jaeger<br/>Porta 16686<br/>Rastreamento Distribuído]
        Prometheus[Prometheus<br/>Porta 9090<br/>Métricas]
        Grafana[Grafana<br/>Porta 3000<br/>Visualização]
        InfluxDB[(InfluxDB<br/>Porta 8086<br/>Métricas K6)]
    end

    subgraph "Bibliotecas Compartilhadas"
        Telemetry[@daap/telemetry<br/>OpenTelemetry SDK]
        Schema[@daap/schema<br/>MongoDB Schema]
        Logger[@daap/logger<br/>Utilitários de Log]
    end

    User -->|Requisição HTTP| Traefik
    Traefik -->|Rotear| Reviews

    Reviews -->|Caminho Primário| Cache
    Reviews -.->|Fallback| Search

    Cache -->|Cache Hit/Miss| Redis
    Cache -.->|Alternativa| Dragonfly
    Cache -->|Cache Miss| Search

    Search -->|Consulta| MongoDB

    Reviews -.->|Contexto de Trace| Jaeger
    Cache -.->|Contexto de Trace| Jaeger
    Search -.->|Contexto de Trace| Jaeger

    Reviews -.->|Métricas| Prometheus
    Cache -.->|Métricas| Prometheus
    Search -.->|Métricas| Prometheus

    Prometheus -->|Visualizar| Grafana
    InfluxDB -->|Resultados K6| Grafana

    Reviews -.->|Usa| Telemetry
    Cache -.->|Usa| Telemetry
    Search -.->|Usa| Telemetry

    Search -.->|Usa| Schema
    Cache -.->|Usa| Schema

    Reviews -.->|Usa| Logger
    Cache -.->|Usa| Logger
    Search -.->|Usa| Logger

    style User fill:#e1f5ff
    style Traefik fill:#ffe1e1
    style Reviews fill:#e1ffe1
    style Cache fill:#fff4e1
    style Search fill:#f4e1ff
    style MongoDB fill:#e1e1ff
    style Redis fill:#ffe1f4
    style Dragonfly fill:#ffe1f4
    style Jaeger fill:#f4ffe1
    style Prometheus fill:#f4ffe1
    style Grafana fill:#f4ffe1
    style InfluxDB fill:#e1e1ff
    style Telemetry fill:#e1f4ff
    style Schema fill:#e1f4ff
    style Logger fill:#e1f4ff
```

### Architecture Layers

#### 1. User Layer
- **Purpose**: External clients consuming the API
- **Access**: Via HTTP to Traefik load balancer

#### 2. Load Balancer
- **Component**: Traefik
- **Responsibilities**:
  - Host-based routing (`reviews.localhost`, `cache.localhost`, `search.localhost`)
  - Health checks
  - TLS termination (HTTPS)
  - Dashboard monitoring (port 8080)

#### 3. Microservices Layer
Three independent services with distinct responsibilities:

- **Reviews Service**: API Gateway with resilient fallback
- **Cache Service**: Intelligent caching with eviction strategies
- **Search Service**: MongoDB full-text search backend

#### 4. Data Layer
- **MongoDB**: Primary data store (product reviews)
- **Redis**: Default cache backend
- **Dragonfly**: Alternative high-performance cache backend

#### 5. Observability Layer
- **Jaeger**: Distributed tracing (OpenTelemetry)
- **Prometheus**: Metrics collection
- **Grafana**: Metrics and traces visualization
- **InfluxDB**: K6 load testing metrics storage

#### 6. Shared Libraries
- **@daap/telemetry**: OpenTelemetry instrumentation
- **@daap/schema**: MongoDB Review schema
- **@daap/logger**: Logging utilities

## Design Principles

### 1. Separation of Concerns
Each service has a single, well-defined responsibility:
- **Reviews Service**: API gateway and request routing
- **Cache Service**: Cache orchestration and eviction
- **Search Service**: Data retrieval from MongoDB

### 2. Resilient Fallback
Multi-level fallback chains ensure high availability:
```
Primary: Cache Service
    ↓ (on failure)
Fallback: Search Service (direct)
```

### 3. Pluggable Architecture
Key components are swappable via configuration:
- **Cache Backend**: Redis ↔ Dragonfly
- **Eviction Strategy**: LFU ↔ LRU ↔ Hybrid

### 4. Observability First
All services instrumented with:
- Distributed tracing (OpenTelemetry)
- Metrics (Prometheus)
- Structured logging

### 5. Horizontal Scalability
- **Reviews Service**: Scalable via `REVIEWS_INSTANCES` env var
- **Cache Service**: Single instance (stateful cache)
- **Search Service**: Single instance (MongoDB handles scale)

### 6. Monorepo Organization
- **pnpm workspaces**: Shared dependency management
- **Turborepo**: Intelligent build caching and task orchestration
- **Workspace protocol**: `workspace:*` for internal packages

## Technology Stack

### Backend Framework
- **NestJS**: Enterprise-grade Node.js framework
  - Dependency injection
  - Modular architecture
  - Decorator-based routing

### Database
- **MongoDB**: NoSQL document database
  - Full-text search (`$text` operator)
  - Text indexes on `title` and `description` fields
  - Mongoose ODM for schema validation

### Cache Backends
- **Redis**: In-memory key-value store
  - Sorted sets for keyword ranking
  - Atomic operations for thread safety
- **Dragonfly**: High-performance Redis alternative
  - Compatible API
  - Lower memory footprint

### Load Balancer
- **Traefik**: Cloud-native reverse proxy
  - Automatic service discovery (Docker labels)
  - Let's Encrypt integration
  - Metrics exporter

### Observability
- **OpenTelemetry**: Vendor-neutral instrumentation
  - Auto-instrumentation (HTTP, MongoDB, NestJS)
  - Custom spans for business logic
  - Context propagation (W3C Trace Context)
- **Jaeger**: Distributed tracing backend
  - OTLP gRPC receiver
  - Query API for trace analysis
- **Prometheus**: Metrics collection
  - Pull-based scraping
  - PromQL query language
- **Grafana**: Visualization platform
  - Prometheus data source
  - Jaeger data source
  - InfluxDB data source (K6 metrics)

### Container Orchestration
- **Docker**: Container runtime
- **Docker Compose**: Multi-container orchestration
- **Bridge Network**: Service-to-service communication

### Build Tools
- **pnpm**: Fast, disk-efficient package manager
- **Turborepo**: Monorepo build system
  - Intelligent caching
  - Dependency-aware task execution
- **TypeScript**: Static typing for all services

### Testing
- **Jest**: Unit testing framework
- **Custom Load Testing**: Bulk test runner (TypeScript)
- **K6**: Advanced load testing
  - Scenario-based testing
  - InfluxDB integration
  - Grafana dashboards

## Service Inventory

### Microservices

| Service | Port | External URL | Role | Scalable |
|---------|------|--------------|------|----------|
| Reviews Service | 3001 | `http://reviews.localhost` | API Gateway with fallback | Yes (REVIEWS_INSTANCES) |
| Cache Service | 3002 | `http://cache.localhost` | Cache orchestration + eviction | No (stateful) |
| Search Service | 3003 | `http://search.localhost` | MongoDB full-text search | No (MongoDB scales) |

### Infrastructure

| Component | Port(s) | External URL | Purpose |
|-----------|---------|--------------|---------|
| Traefik | 80, 443, 8080 | `http://localhost:8080` | Load balancer + routing |
| MongoDB | 27017 | `mongodb://localhost:27017` | Primary database |
| Redis | 6379 | `redis://localhost:6379` | Default cache backend |
| Dragonfly | 6380 | `redis://localhost:6380` | Alternative cache backend |
| Jaeger | 16686, 4317, 4318 | `http://localhost:16686` | Distributed tracing UI + OTLP |
| Prometheus | 9090 | `http://localhost:9090` | Metrics collection + query |
| Grafana | 3000 | `http://localhost:3000` | Metrics + traces visualization |
| InfluxDB | 8086 | `http://localhost:8086` | K6 metrics storage |

### Shared Packages

| Package | Purpose | Consumers |
|---------|---------|-----------|
| `@daap/telemetry` | OpenTelemetry SDK + tracing | All services |
| `@daap/schema` | MongoDB Review schema | Cache, Search services |
| `@daap/logger` | Logging utilities | All services |
| `@daap/jest-presets` | Jest configuration | All services (tests) |
| `@daap/eslint-config` | ESLint rules | All services + packages |
| `@daap/typescript-config` | TypeScript config | All services + packages |
| `@daap/tools` | Load testing scripts | Development only |

### Tools

| Tool | Location | Purpose |
|------|----------|---------|
| Bulk Test Runner | `packages/tools/load-testing/` | Concurrent request testing |
| Strategy Comparison | `packages/tools/strategy-comparison/` | Compare LFU/LRU/Hybrid |
| K6 Scripts | `packages/tools/k6/` | Advanced load testing |
| Management CLI | `daap.sh` | Deployment automation |

## Project Structure

```
daap/
├── apps/                          # Microservices
│   ├── reviews-service/          # API Gateway (Port 3001)
│   ├── cache-service/            # Cache Orchestration (Port 3002)
│   └── search-service/           # MongoDB Backend (Port 3003)
├── packages/                      # Shared Libraries
│   ├── telemetry/               # OpenTelemetry SDK
│   ├── schema/                  # MongoDB Schema
│   ├── logger/                  # Logging
│   ├── jest-presets/           # Test Config
│   ├── eslint-config/          # Linting
│   ├── typescript-config/      # TypeScript Config
│   └── tools/                  # Testing Tools
│       ├── load-testing/       # Bulk Test Runner
│       ├── strategy-comparison/ # Eviction Strategy Analyzer
│       └── k6/                 # K6 Load Testing
├── docs/                          # Documentation (this directory)
├── docker-compose.yml            # Infrastructure Orchestration
├── traefik.yml                  # Load Balancer Config
├── prometheus.yml               # Metrics Scraping Config
├── turbo.json                   # Turborepo Pipeline
├── pnpm-workspace.yaml          # Monorepo Workspace
├── .env.example                 # Environment Variables Template
└── daap.sh                      # Management CLI
```

## Next Steps

- [Data Flow Patterns](./02-data-flow.md) - Request lifecycle and caching flows
- [Network Topology](./03-network-topology.md) - Docker networking and service discovery
- [Cache Strategies](./04-cache-strategies.md) - LFU, LRU, and Hybrid eviction
- [Observability](./05-observability.md) - Distributed tracing and metrics
- [Deployment Guide](./06-deployment.md) - Container orchestration and scaling
- [Testing Strategy](./07-testing.md) - Load testing and performance validation
