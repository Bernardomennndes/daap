FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install && pnpm --filter @daap/cache-service build

FROM gcr.io/distroless/nodejs20-debian11
WORKDIR /app
COPY --from=builder /app/apps/cache-service/dist ./dist
COPY --from=builder /app/apps/cache-service/package.json .
ENV NODE_ENV=production
CMD ["dist/main.js"]
