#!/bin/bash

echo "📊 DAAP - Status dos Serviços"
echo "======================================"

# Verificar se o Docker Compose está rodando
if ! docker-compose ps >/dev/null 2>&1; then
    echo "❌ Docker Compose não está rodando ou não foi encontrado"
    exit 1
fi

echo ""
echo "🐳 Containers ativos:"
docker-compose ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"

echo ""
echo "📈 Instâncias do reviews-service:"
reviews_count=$(docker-compose ps -q reviews-service | wc -l | tr -d ' ')
echo "Total de instâncias: $reviews_count"

if [ "$reviews_count" -gt 0 ]; then
    echo ""
    echo "🏥 Health check das instâncias:"
    docker-compose ps reviews-service --format "table {{.Name}}\t{{.State}}"
fi

echo ""
echo "🌐 Testando endpoints:"
test_endpoint() {
    local url=$1
    local name=$2
    local timeout=5
    
    local status=$(curl -s -o /dev/null -w "%{http_code}" --max-time $timeout "$url" 2>/dev/null)
    local response_time=$(curl -s -o /dev/null -w "%{time_total}" --max-time $timeout "$url" 2>/dev/null)
    
    if [ "$status" = "200" ]; then
        echo "✅ $name: OK ($status) - ${response_time}s"
    elif [ "$status" = "000" ]; then
        echo "❌ $name: TIMEOUT/CONEXÃO FALHOU"
    else
        echo "⚠️  $name: HTTP $status"
    fi
}

test_endpoint "http://reviews.localhost/health" "Reviews API"
test_endpoint "http://cache.localhost/health" "Cache API"
test_endpoint "http://search.localhost/health" "Search API"
test_endpoint "http://daap.localhost" "Web Interface"
test_endpoint "http://localhost:8080" "Traefik Dashboard"

echo ""
echo "🔄 Teste de distribuição de load (Reviews Service):"
if [ "$reviews_count" -gt 1 ]; then
    echo "Fazendo 10 requisições para verificar load balancing..."
    declare -A instance_count
    
    for i in {1..10}; do
        response=$(curl -s "http://reviews.localhost/health" 2>/dev/null)
        if [ $? -eq 0 ]; then
            # Extrair instance ID do JSON response
            instance=$(echo "$response" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('instance', 'unknown'))
except:
    print('unknown')
" 2>/dev/null)
            instance_count[$instance]=$((${instance_count[$instance]} + 1))
            printf "."
        else
            printf "x"
        fi
    done
    
    echo ""
    echo "Distribuição das requisições:"
    for instance in "${!instance_count[@]}"; do
        echo "  $instance: ${instance_count[$instance]} requisições"
    done
else
    echo "Apenas 1 instância rodando - load balancing não aplicável"
fi

echo ""
echo "💾 Uso de recursos:"
echo "CPU e Memória dos containers principais:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker-compose ps -q) 2>/dev/null || echo "Erro ao obter estatísticas"

echo ""
echo "📋 Logs recentes (últimas 10 linhas):"
echo "Reviews Service:"
docker-compose logs --tail=5 reviews-service 2>/dev/null | tail -5

echo ""
echo "Cache Service:"
docker-compose logs --tail=3 cache-service 2>/dev/null | tail -3

echo ""
echo "🔧 Comandos úteis:"
echo "  - Ver logs completos: docker-compose logs -f reviews-service"
echo "  - Escalar serviço: ./scale.sh [número]"
echo "  - Restart serviço: docker-compose restart reviews-service"
echo "  - Ver métricas detalhadas: docker stats"
echo "  - Acessar shell do container: docker-compose exec reviews-service sh"
