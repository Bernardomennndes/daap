#!/bin/bash

# Configurações padrão
DEFAULT_INSTANCES=3
INSTANCES=${1:-$DEFAULT_INSTANCES}

echo "🚀 Iniciando deploy do DAAP com $INSTANCES instâncias do reviews-service..."

# Validar número de instâncias
if ! [[ "$INSTANCES" =~ ^[0-9]+$ ]] || [ "$INSTANCES" -lt 1 ]; then
    echo "❌ Número de instâncias deve ser um número positivo"
    echo "Uso: ./deploy.sh [número_de_instâncias]"
    echo "Exemplo: ./deploy.sh 5"
    exit 1
fi

# Criar diretórios necessários
echo "📁 Criando diretórios necessários..."
mkdir -p letsencrypt

# Parar containers existentes
echo "📦 Parando containers existentes..."
docker-compose down

# Limpar containers órfãos se existirem
echo "🧹 Limpando containers órfãos..."
docker-compose down --remove-orphans

# Construir imagens
echo "🔨 Construindo imagens..."
docker-compose build

# Iniciar serviços base (sem reviews-service)
echo "🚀 Iniciando serviços base..."
docker-compose up -d traefik mongodb redis dragonfly

# Aguardar serviços base ficarem prontos
echo "⏳ Aguardando serviços base (15 segundos)..."
sleep 15

# Iniciar search-service e cache-service
echo "🔧 Iniciando search-service e cache-service..."
docker-compose up -d search-service cache-service

# Aguardar serviços auxiliares ficarem prontos
echo "⏳ Aguardando serviços auxiliares (20 segundos)..."
sleep 20

# Escalar o reviews-service
echo "📈 Escalando reviews-service para $INSTANCES instâncias..."
docker-compose up -d --scale reviews-service=$INSTANCES reviews-service

# Aguardar reviews-service ficar pronto
echo "⏳ Aguardando reviews-service (30 segundos)..."
sleep 30

# Iniciar web interface
echo "🌐 Iniciando web interface..."
docker-compose up -d web

# Aguardar web interface ficar pronta
echo "⏳ Aguardando web interface (10 segundos)..."
sleep 10

# Verificar status dos serviços
echo ""
echo "🔍 Verificando status dos serviços..."
check_service() {
    local url=$1
    local name=$2
    local max_attempts=5
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo "✅ $name está funcionando"
            return 0
        else
            echo "⏳ Tentativa $attempt/$max_attempts: $name ainda não está pronto..."
            sleep 5
            ((attempt++))
        fi
    done
    echo "❌ $name não está respondendo após $max_attempts tentativas"
    return 1
}

# Testar endpoints
check_service "http://reviews.localhost/health" "Reviews API"
check_service "http://cache.localhost/health" "Cache API"  
check_service "http://search.localhost/health" "Search API"
check_service "http://daap.localhost" "Web Interface"

# Mostrar instâncias ativas
echo ""
echo "📊 Instâncias ativas do reviews-service:"
docker-compose ps reviews-service

echo ""
echo "📋 Resumo dos containers:"
docker-compose ps

echo ""
echo "✅ Deploy concluído com $INSTANCES instâncias do reviews-service!"
echo ""
echo "🌐 Serviços disponíveis:"
echo "  - 🏠 Web Interface: http://daap.localhost"
echo "  - 📝 Reviews API: http://reviews.localhost"
echo "  - 💾 Cache API: http://cache.localhost"  
echo "  - 🔍 Search API: http://search.localhost"
echo "  - 📊 Traefik Dashboard: http://localhost:8080"
echo ""
echo "💡 Dicas:"
echo "  - Para ver logs: ./logs.sh reviews"
echo "  - Para escalar: ./scale.sh [número]"
echo "  - Para monitorar: ./monitor.sh"
echo "  - Para parar: docker-compose down"
