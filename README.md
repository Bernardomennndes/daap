# DAAP - Distributed Application Architecture Project

Sistema distribuído com arquitetura de microserviços escalável, utilizando Traefik como load balancer e cache distribuído.

## 🏗️ Arquitetura

### Visão Geral do Sistema

```
                    ┌─────────────────────────────────────────────────┐
                    │              TRAEFIK LOAD BALANCER              │
                    │          (Service Discovery & Routing)          │
                    └─────────────────┬───────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────────┐
          │                           │                               │
    ┌─────▼─────┐              ┌──────▼──────┐              ┌─────▼─────┐
    │    WEB    │              │   REVIEWS   │              │   CACHE   │
    │ FRONTEND  │              │   SERVICE   │              │  SERVICE  │
    │(Next.js)  │              │ (SCALABLE)  │◄─────────────┤  (Redis)  │
    └───────────┘              └─────────────┘              └───────────┘
          │                           │                               │
          │                           │                               │
          │                    ┌──────▼──────┐                        │
          │                    │   SEARCH    │                        │
          └────────────────────┤   SERVICE   │◄───────────────────────┘
                               │ (MongoDB)   │
                               └─────────────┘
```

### Instâncias Escaláveis do Reviews Service

```
                        ┌─────────────────────────────────┐
                        │        TRAEFIK ROUTER           │
                        │     (reviews.localhost)         │
                        └─────────────┬───────────────────┘
                                      │
                         ┌────────────┼────────────┐
                         │            │            │
                ┌────────▼───┐ ┌──────▼───┐ ┌─────▼────┐
                │ Reviews #1 │ │Reviews #2│ │Reviews #N│
                │  :3001     │ │  :3001   │ │  :3001   │
                └────────────┘ └──────────┘ └──────────┘
                         │            │            │
                         └────────────┼────────────┘
                                      │
                              ┌───────▼──────┐
                              │ SHARED CACHE │
                              │   SERVICE    │
                              └──────────────┘
```

### Fluxo de Dados e Cache

```
1. Web Client    ──GET /reviews?q=query──┐
                                          │
2. Traefik       ◄─────────────────────────┘
   │ Load Balance │
   └─────────────┐
                 │
3. Reviews #N    ◄┘
   │ Check Cache │
   └────────────┐
                │
4. Cache Service ◄┘
   │ Hit/Miss    │
   └────────────┐
                │
5. Search Service◄┘ (if cache miss)
   │ MongoDB     │
   └────────────┐
                │
6. Return Data   │
   Reviews #N ◄──┘
   │ Update Cache
   └────────────┐
                │
7. Response      │
   Web Client ◄──┘
```

### Componentes da Infraestrutura

| Componente | Tecnologia | Função | Escalável |
|------------|------------|---------|-----------|
| **Load Balancer** | Traefik v2.10 | Roteamento e distribuição de carga | ✅ |
| **Reviews API** | NestJS + TypeScript | API principal de reviews | ✅ (N instâncias) |
| **Cache Service** | NestJS + Redis/Dragonfly | Cache inteligente com fallback | ❌ (singleton) |
| **Search Service** | NestJS + MongoDB | Busca full-text | ❌ (singleton) |
| **Web Frontend** | Next.js 14 | Interface do usuário | ✅ |
| **Database** | MongoDB 7 | Persistência de dados | ❌ (singleton) |
| **Cache Storage** | Redis 7 + Dragonfly | Armazenamento de cache | ❌ (singleton) |

### Características do Load Balancing

- **Algoritmo**: Round Robin (padrão do Traefik)
- **Health Checks**: Endpoint `/health` a cada 30s
- **Service Discovery**: Automático via Docker labels
- **Sticky Sessions**: Não implementado (stateless)
- **SSL Termination**: Suporte via Let's Encrypt
- **Métricas**: Prometheus integrado

## 🚀 Funcionalidades

- ✅ **Load Balancing**: Traefik distribui requisições entre múltiplas instâncias
- ✅ **Auto Scaling**: Escalonamento dinâmico de instâncias
- ✅ **Health Checks**: Monitoramento automático da saúde dos serviços
- ✅ **Cache Distribuído**: Redis para performance otimizada
- ✅ **Service Discovery**: Descoberta automática de serviços
- ✅ **Logs Centralizados**: Agregação de logs de todas as instâncias

## 📋 Pré-requisitos

- Docker & Docker Compose
- Node.js 18+ (para desenvolvimento local)
- pnpm (gerenciador de pacotes)
- Pelo menos 8GB RAM e 5GB de espaço livre
- Portas livres: 80, 443, 3001-3003, 6379, 8080, 27017

## ⚡ Quick Start

### 1. Verificar Pré-requisitos
```bash
# Verificar se tudo está pronto para o deploy
./check-requirements.sh
```

### 2. Validar Configuração
```bash
# Validar arquivo .env
./validate-env.sh
```

### 3. Configurar Hosts Locais
```bash
# Configurar hosts para desenvolvimento local
sudo sh -c 'cat hosts-local.txt >> /etc/hosts'
```

### 4. Deploy com Load Balancing
```bash
# Deploy com 3 instâncias (padrão)
./deploy.sh

# Deploy com N instâncias específicas
./deploy.sh 5
```

### 5. Monitorar Sistema
```bash
# Ver status de todos os serviços
./monitor.sh

# Ver logs em tempo real
./logs.sh reviews
```

## 🛠️ Scripts de Gerenciamento Avançados

### 1. Configurar hosts locais
```bash
# Adicionar entradas ao /etc/hosts
sudo sh -c 'cat hosts-local.txt >> /etc/hosts'
```

### 2. Deploy com Load Balancing
```bash
# Deploy com 3 instâncias (padrão)
./deploy.sh

# Deploy com N instâncias específicas
./deploy.sh 5
```

## 🎯 Scripts de Gerenciamento

### Deploy e Escalonamento
```bash
# Deploy inicial
./deploy.sh [número_de_instâncias]

# Escalar dinamicamente
./scale.sh [número_de_instâncias] [serviço]

# Monitorar status
./monitor.sh

# Ver logs
./logs.sh [serviço] [linhas]

# Teste de carga
./load-test.sh [requisições] [concorrência] [url]
```

### Exemplos Práticos
```bash
# Deploy com 5 instâncias do reviews-service
./deploy.sh 5

# Escalar para 8 instâncias
./scale.sh 8

# Ver logs em tempo real
./logs.sh reviews

# Teste de carga com 100 requisições
./load-test.sh 100 10 http://reviews.localhost/health
```

## 🌐 Endpoints Disponíveis

| Serviço | URL | Descrição |
|---------|-----|-----------|
| **Web Interface** | http://daap.localhost | Interface web principal |
| **Reviews API** | http://reviews.localhost | API de reviews (load balanced) |
| **Cache API** | http://cache.localhost | Serviço de cache |
| **Search API** | http://search.localhost | Serviço de busca |
| **Traefik Dashboard** | http://localhost:8080 | Dashboard do load balancer |

## Services

### 🎯 Reviews Service (Port 3001)
- **Purpose**: Main API for managing reviews
- **Features**: CRUD operations, search integration
- **Dependencies**: Cache Service for search operations

### 🔄 Cache Service (Port 3002) 
- **Purpose**: Intelligent caching middleware with abstraction layer
- **Features**: Abstract cache adapter pattern (Redis/Dragonfly)
- **Dependencies**: Search Service, Redis/Dragonfly

### 🔍 Search Service (Port 3003)
- **Purpose**: Full-text search with MongoDB
- **Features**: MongoDB text search, Portuguese language support
- **Dependencies**: MongoDB

### 🌐 Web Frontend (Port 3000)
- **Purpose**: User interface built with Next.js
- **Dependencies**: Reviews Service

## Quick Start

### Development Mode
```bash
# Install dependencies
npm install

# Start all services
npm run dev:services
```

### Docker Deployment
```bash
# Start all services with Docker
npm run docker:up
```

## Testing
```bash
# Test all services integration
npm run test:integration
```

## What's inside?

This Turborepo includes the following:

### Apps and Packages

- `web`: a [Next.js](https://nextjs.org/) app
- `api`: an [Express](https://expressjs.com/) server
- `@daap/ui`: a React component library
- `@daap/logger`: Isomorphic logger (a small wrapper around console.log)
- `@daap/eslint-config`: ESLint presets
- `@daap/typescript-config`: tsconfig.json's used throughout the monorepo
- `@daap/jest-presets`: Jest configurations

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Docker

This repo is configured to be built with Docker, and Docker compose. To build all apps in this repo:

```
# Install dependencies
pnpm install

# Create a network, which allows containers to communicate
# with each other, by using their container name as a hostname
docker network create app_network

# Build prod using new BuildKit engine
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose -f docker-compose.yml build

# Start prod in detached mode
docker-compose -f docker-compose.yml up -d
```

Open http://localhost:3000.

To shutdown all running containers:

```
# Stop all running containers
docker kill $(docker ps -q) && docker rm $(docker ps -a -q)
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

This example includes optional remote caching. In the Dockerfiles of the apps, uncomment the build arguments for `TURBO_TEAM` and `TURBO_TOKEN`. Then, pass these build arguments to your Docker build.

You can test this behavior using a command like:

`docker build -f apps/web/Dockerfile . --build-arg TURBO_TEAM=“your-team-name” --build-arg TURBO_TOKEN=“your-token“ --no-cache`

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Jest](https://jestjs.io) test runner for all things JavaScript
- [Prettier](https://prettier.io) for code formatting
