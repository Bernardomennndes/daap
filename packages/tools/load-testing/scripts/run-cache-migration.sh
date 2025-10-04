#!/bin/bash

# Cache Migration Test Script Wrapper
# 
# Este script facilita a execução do teste de migração de cache
# Uso: ./run-bulk-test-runner.sh [queries] [concorrencia]

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Função para logging
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${CYAN}[${timestamp}] [INFO    ]${NC} $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[${timestamp}] [WARN    ]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[${timestamp}] [ERROR   ]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[${timestamp}] [SUCCESS ]${NC} $message"
            ;;
    esac
}

# Verificar se estamos no diretório correto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

# Valores padrão
QUERIES=${1:-100}
CONCURRENCY=${2:-5}

echo ""
echo "=========================================="
echo "🧪 Cache Migration Test Runner"
echo "=========================================="
echo "Queries: $QUERIES | Concorrência: $CONCURRENCY"
echo ""

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    log "ERROR" "Node.js não encontrado. Instale o Node.js para continuar."
    exit 1
fi

# Verificar se o Redis CLI está instalível
if ! command -v redis-cli &> /dev/null; then
    log "ERROR" "redis-cli não encontrado. Instale o Redis CLI para continuar."
    echo "       No macOS: brew install redis"
    echo "       No Ubuntu: sudo apt install redis-tools"
    exit 1
fi

# Verificar se os serviços estão rodando
log "INFO" "Verificando serviços necessários..."

# Verificar Docker
if ! command -v docker &> /dev/null; then
    log "ERROR" "Docker não encontrado. Certifique-se de que o Docker está instalado."
    exit 1
fi

# Verificar se o docker-compose está rodando
cd "$PROJECT_ROOT"
if ! docker compose ps | grep -q "Up"; then
    log "WARN" "Serviços Docker não estão rodando. Iniciando..."
    if ! docker compose up -d; then
        log "ERROR" "Falha ao iniciar serviços Docker"
        exit 1
    fi
    log "INFO" "Aguardando serviços iniciarem..."
    sleep 10
fi

# Verificar conectividade dos serviços
log "INFO" "Testando conectividade dos serviços..."

# Testar Redis
if ! redis-cli -h localhost -p 6379 ping > /dev/null 2>&1; then
    log "ERROR" "Não foi possível conectar ao Redis (localhost:6379)"
    exit 1
fi

# Testar Dragonfly
if ! redis-cli -h localhost -p 6380 ping > /dev/null 2>&1; then
    log "ERROR" "Não foi possível conectar ao Dragonfly (localhost:6380)"
    exit 1
fi

# Testar serviço web
if ! curl -s -H "Host: reviews.localhost" http://localhost/health > /dev/null; then
    log "WARN" "Serviço de reviews pode não estar respondendo. Continuando mesmo assim..."
fi

log "SUCCESS" "Todos os serviços estão funcionais!"

# Executar o script principal
log "INFO" "Iniciando teste de migração de cache..."
echo ""

cd "$SCRIPT_DIR"
node bulk-test-runner.js "$QUERIES" "$CONCURRENCY"

RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
    log "SUCCESS" "Teste concluído com sucesso!"
else
    log "ERROR" "Teste falhou com código de saída $RESULT"
fi

exit $RESULT
