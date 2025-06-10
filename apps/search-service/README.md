# Search Service

## Variáveis de ambiente

- `MONGO_URI`: URI de conexão com o MongoDB

## Comandos

```sh
pnpm install
pnpm --filter @daap/schema build # Compile a lib de schemas antes!
pnpm --filter @daap/search-service run start:dev
```

## Endpoints

- `GET /search?q=...&page=1&size=10` — Busca full-text paginada
- `GET /health` — Health check

## Docker

```sh
docker-compose up --build
```
