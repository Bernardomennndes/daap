#!/bin/bash

# DAAP - Automated Strategy Comparison Test
# Usage: ./run-comparison-test.sh [num_requests] [concurrency]

set -e

NUM_REQUESTS=${1:-5000}
CONCURRENCY=${2:-10}
RESULTS_DIR="packages/tools/results"

echo "🚀 DAAP - Automated Strategy Comparison Test"
echo "=============================================="
echo "Configuration:"
echo "  - Requests: $NUM_REQUESTS"
echo "  - Concurrency: $CONCURRENCY"
echo ""

# Função para rodar teste com uma estratégia
run_test() {
  local strategy=$1

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Testing ${strategy^^} Strategy"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # 1. Parar serviços
  echo "⏸️  Stopping services..."
  docker-compose down -v > /dev/null 2>&1

  # 2. Atualizar .env com estratégia
  echo "🔧 Setting EVICTION_STRATEGY=$strategy"
  sed -i.bak "s/^EVICTION_STRATEGY=.*/EVICTION_STRATEGY=$strategy/" .env

  # 3. Subir infraestrutura
  echo "🐳 Starting infrastructure (MongoDB, Redis, Jaeger)..."
  docker-compose up -d mongodb redis jaeger > /dev/null 2>&1
  sleep 10

  # 4. Subir serviços DAAP
  echo "🚀 Starting DAAP services..."
  docker-compose up -d --build reviews-service cache-service search-service > /dev/null 2>&1
  sleep 15

  # 5. Health check
  echo "🏥 Waiting for services to be healthy..."
  for i in {1..30}; do
    if curl -sf http://cache.localhost/health > /dev/null 2>&1; then
      echo "   ✅ Services are ready!"
      break
    fi
    echo -n "."
    sleep 2
  done
  echo ""

  # 6. Rodar load test
  echo "🔥 Running load test ($NUM_REQUESTS requests, $CONCURRENCY concurrent)..."
  cd packages/tools/load-testing
  pnpm test:bulk $NUM_REQUESTS $CONCURRENCY > /dev/null 2>&1 || echo "   ⚠️  Load test completed with warnings"
  cd ../../..

  echo "✅ Load test complete for $strategy"
  echo ""

  # 7. Aguardar traces serem exportados para Jaeger
  echo "⏳ Waiting for traces to be exported to Jaeger..."
  sleep 10
}

# Criar diretório de resultados
mkdir -p "$RESULTS_DIR"

# Rodar testes para cada estratégia
for strategy in lfu lru hybrid; do
  run_test $strategy
done

# Coletar e comparar métricas
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Collecting Metrics & Generating Reports"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd packages/tools/strategy-comparison
npx ts-node compare-strategies.ts 1

echo ""
echo "🎉 All tests complete!"
echo ""
echo "📊 Reports available in: $RESULTS_DIR"
ls -lh "$RESULTS_DIR"/comparison-report-*.{md,csv} 2>/dev/null || echo "   (No reports generated yet)"

# Restaurar .env original
mv .env.bak .env 2>/dev/null || true

echo ""
echo "✅ Done! Check Jaeger UI at http://localhost:16686 for detailed traces."
