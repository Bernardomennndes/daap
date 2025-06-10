# DAAP - Microservices Architecture

A complete monorepo project implementing a microservices architecture for a review system with intelligent caching and search capabilities.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │ Reviews Service │    │  Cache Service  │
│    (Next.js)    │◄──►│    (NestJS)     │◄──►│    (NestJS)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                │                        ▼
                                │              ┌─────────────────┐
                                │              │ Search Service  │
                                │              │    (NestJS)     │
                                │              └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │    MongoDB      │    │  Redis/Dragonfly│
                       │   (Database)    │    │     (Cache)     │
                       └─────────────────┘    └─────────────────┘
```

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
yarn install

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
