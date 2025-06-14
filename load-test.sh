#!/bin/bash

REQUESTS=${1:-100}
CONCURRENT=${2:-10}
URL=${3:-"http://reviews.localhost/health"}

echo "🚀 DAAP - Teste de Carga"
echo "========================="
echo "URL: $URL"
echo "Requisições: $REQUESTS"
echo "Concorrência: $CONCURRENT"
echo ""

# Verificar se o serviço está respondendo
echo "🔍 Verificando se o serviço está ativo..."
if ! curl -f -s "$URL" > /dev/null; then
    echo "❌ Serviço não está respondendo em $URL"
    echo "Verifique se os containers estão rodando: docker-compose ps"
    exit 1
fi

echo "✅ Serviço está ativo. Iniciando teste de carga..."
echo ""

# Função para fazer teste simples com curl
load_test_curl() {
    echo "📊 Executando teste com curl..."
    
    start_time=$(date +%s)
    success_count=0
    error_count=0
    
    declare -A instance_distribution
    
    for i in $(seq 1 $REQUESTS); do
        response=$(curl -s -w "%{http_code}|%{time_total}" "$URL" 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            http_code=$(echo "$response" | cut -d'|' -f2)
            time_total=$(echo "$response" | cut -d'|' -f3)
            
            if [ "$http_code" = "200" ]; then
                success_count=$((success_count + 1))
                
                # Extrair instance ID se for endpoint de health
                if [[ "$URL" == *"/health"* ]]; then
                    instance=$(echo "$response" | python3 -c "
import sys, json
try:
    lines = sys.stdin.read().split('|')
    if len(lines) > 0:
        data = json.loads(lines[0])
        print(data.get('instance', 'unknown'))
    else:
        print('unknown')
except:
    print('unknown')
" 2>/dev/null)
                    instance_distribution[$instance]=$((${instance_distribution[$instance]} + 1))
                fi
            else
                error_count=$((error_count + 1))
            fi
        else
            error_count=$((error_count + 1))
        fi
        
        # Mostrar progresso
        if [ $((i % 10)) -eq 0 ]; then
            printf "Progress: %d/%d\r" $i $REQUESTS
        fi
    done
    
    end_time=$(date +%s)
    total_time=$((end_time - start_time))
    
    echo ""
    echo "📈 Resultados do Teste:"
    echo "  Total de requisições: $REQUESTS"
    echo "  Sucessos: $success_count"
    echo "  Erros: $error_count"
    echo "  Taxa de sucesso: $(($success_count * 100 / $REQUESTS))%"
    echo "  Tempo total: ${total_time}s"
    echo "  Requisições/segundo: $(($REQUESTS / $total_time))"
    
    if [ ${#instance_distribution[@]} -gt 0 ]; then
        echo ""
        echo "🔄 Distribuição por instância:"
        for instance in "${!instance_distribution[@]}"; do
            percentage=$(( ${instance_distribution[$instance]} * 100 / success_count ))
            echo "  $instance: ${instance_distribution[$instance]} (${percentage}%)"
        done
    fi
}

# Executar teste
load_test_curl

echo ""
echo "💡 Para testes mais avançados, considere usar:"
echo "  - Apache Bench: apt-get install apache2-utils && ab -n $REQUESTS -c $CONCURRENT $URL"
echo "  - wrk: wrk -t$CONCURRENT -c$CONCURRENT -d30s $URL"
echo "  - hey: hey -n $REQUESTS -c $CONCURRENT $URL"
