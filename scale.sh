#!/bin/bash

INSTANCES=${1:-3}
SERVICE=${2:-reviews-service}

if ! [[ "$INSTANCES" =~ ^[0-9]+$ ]] || [ "$INSTANCES" -lt 1 ]; then
    echo "❌ Número de instâncias deve ser um número positivo"
    echo "Uso: ./scale.sh [número_de_instâncias] [serviço]"
    echo "Exemplo: ./scale.sh 5 reviews-service"
    exit 1
fi

echo "📈 Escalando $SERVICE para $INSTANCES instâncias..."

# Obter número atual de instâncias
current_instances=$(docker-compose ps -q $SERVICE | wc -l | tr -d ' ')
echo "📊 Instâncias atuais: $current_instances"

if [ "$current_instances" -eq "$INSTANCES" ]; then
    echo "ℹ️  Número de instâncias já está em $INSTANCES. Nenhuma ação necessária."
    exit 0
fi

# Escalar o serviço
docker-compose up -d --scale $SERVICE=$INSTANCES $SERVICE

echo "⏳ Aguardando estabilização (15 segundos)..."
sleep 15

# Verificar health checks
echo "🔍 Verificando health do serviço..."
if [ "$SERVICE" = "reviews-service" ]; then
    for i in {1..5}; do
        if curl -f -s "http://reviews.localhost/health" > /dev/null; then
            echo "✅ Reviews service está respondendo"
            break
        else
            echo "⏳ Aguardando reviews service... ($i/5)"
            sleep 5
        fi
    done
fi

echo ""
echo "📊 Status atual do $SERVICE:"
docker-compose ps $SERVICE

echo ""
echo "🌐 Instâncias ativas:"
docker-compose ps $SERVICE --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"

echo ""
echo "✅ Escalonamento para $INSTANCES instâncias concluído!"

# Mostrar distribuição de load se for reviews-service
if [ "$SERVICE" = "reviews-service" ]; then
    echo ""
    echo "🔄 Testando distribuição de load (5 requisições):"
    for i in {1..5}; do
        response=$(curl -s "http://reviews.localhost/health" 2>/dev/null)
        if [ $? -eq 0 ]; then
            instance=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('instance', 'unknown'))" 2>/dev/null || echo "unknown")
            echo "  Requisição $i: Instância $instance"
        else
            echo "  Requisição $i: Falha na conexão"
        fi
        sleep 1
    done
fi
