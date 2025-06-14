#!/bin/bash

echo "🔍 DAAP - Validação da Configuração .env"
echo "========================================="

# Verificar se o arquivo .env existe
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "💡 Execute: cp .env.example .env"
    exit 1
fi

echo "✅ Arquivo .env encontrado"
echo ""

# Carregar variáveis do .env
set -a
source .env
set +a

echo "📊 Configurações carregadas:"
echo "========================================="

# Validar configurações principais
echo "🏗️  Configuração de Escalonamento:"
echo "  REVIEWS_INSTANCES: ${REVIEWS_INSTANCES:-'❌ NÃO DEFINIDO'}"
echo ""

echo "🌐 Portas dos Serviços:"
echo "  Reviews Service: ${REVIEWS_SERVICE_PORT:-'❌ NÃO DEFINIDO'}"
echo "  Cache Service: ${CACHE_SERVICE_PORT:-'❌ NÃO DEFINIDO'}"
echo "  Search Service: ${SEARCH_SERVICE_PORT:-'❌ NÃO DEFINIDO'}"
echo "  Web Interface: ${WEB_PORT:-'❌ NÃO DEFINIDO'}"
echo "  Traefik Dashboard: ${TRAEFIK_DASHBOARD_PORT:-'❌ NÃO DEFINIDO'}"
echo ""

echo "🔗 URLs Internas (Docker Network):"
echo "  Reviews: ${REVIEWS_SERVICE_URL:-'❌ NÃO DEFINIDO'}"
echo "  Cache: ${CACHE_SERVICE_URL:-'❌ NÃO DEFINIDO'}"
echo "  Search: ${SEARCH_SERVICE_URL:-'❌ NÃO DEFINIDO'}"
echo ""

echo "🌍 URLs Externas (Traefik):"
echo "  Web: ${WEB_EXTERNAL_URL:-'❌ NÃO DEFINIDO'}"
echo "  Reviews API: ${REVIEWS_EXTERNAL_URL:-'❌ NÃO DEFINIDO'}"
echo "  Cache API: ${CACHE_EXTERNAL_URL:-'❌ NÃO DEFINIDO'}"
echo "  Search API: ${SEARCH_EXTERNAL_URL:-'❌ NÃO DEFINIDO'}"
echo ""

echo "💾 Configuração do Banco:"
echo "  MongoDB URI: ${MONGO_URI:-'❌ NÃO DEFINIDO'}"
echo "  MongoDB Host: ${MONGO_HOST:-'❌ NÃO DEFINIDO'}"
echo "  MongoDB Port: ${MONGO_PORT:-'❌ NÃO DEFINIDO'}"
echo "  Database: ${MONGO_DATABASE:-'❌ NÃO DEFINIDO'}"
echo ""

echo "⚡ Configuração do Cache:"
echo "  Cache Adapter: ${CACHE_ADAPTER:-'❌ NÃO DEFINIDO'}"
echo "  Redis Host: ${REDIS_HOST:-'❌ NÃO DEFINIDO'}"
echo "  Redis Port: ${REDIS_PORT:-'❌ NÃO DEFINIDO'}"
echo "  Redis URL: ${REDIS_URL:-'❌ NÃO DEFINIDO'}"
echo ""

echo "🔧 Configuração de Debug:"
echo "  Environment: ${ENV:-'❌ NÃO DEFINIDO'}"
echo "  Debug Mode: ${DEBUG:-'❌ NÃO DEFINIDO'}"
echo "  Log Level: ${LOG_LEVEL:-'❌ NÃO DEFINIDO'}"
echo ""

echo "🏥 Health Checks:"
echo "  Interval: ${HEALTH_CHECK_INTERVAL:-'❌ NÃO DEFINIDO'}s"
echo "  Timeout: ${HEALTH_CHECK_TIMEOUT:-'❌ NÃO DEFINIDO'}s"
echo ""

# Validações críticas
echo "🔍 Validações Críticas:"
echo "========================================="

errors=0

# Verificar se as variáveis críticas estão definidas
critical_vars=(
    "REVIEWS_INSTANCES"
    "MONGO_URI"
    "REDIS_URL"
    "CACHE_SERVICE_URL"
    "SEARCH_SERVICE_URL"
)

for var in "${critical_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ $var não está definido"
        errors=$((errors + 1))
    else
        echo "✅ $var: ${!var}"
    fi
done

echo ""

# Verificar se as portas são números válidos
ports=(
    "REVIEWS_SERVICE_PORT"
    "CACHE_SERVICE_PORT"
    "SEARCH_SERVICE_PORT"
    "WEB_PORT"
    "TRAEFIK_DASHBOARD_PORT"
    "MONGO_PORT"
    "REDIS_PORT"
)

echo "🔌 Validação de Portas:"
for port_var in "${ports[@]}"; do
    port_value="${!port_var}"
    if [[ "$port_value" =~ ^[0-9]+$ ]] && [ "$port_value" -ge 1 ] && [ "$port_value" -le 65535 ]; then
        echo "✅ $port_var: $port_value"
    else
        echo "❌ $port_var: '$port_value' não é uma porta válida"
        errors=$((errors + 1))
    fi
done

echo ""

# Verificar se o número de instâncias é válido
if [[ "$REVIEWS_INSTANCES" =~ ^[0-9]+$ ]] && [ "$REVIEWS_INSTANCES" -ge 1 ]; then
    echo "✅ REVIEWS_INSTANCES: $REVIEWS_INSTANCES (válido)"
else
    echo "❌ REVIEWS_INSTANCES: '$REVIEWS_INSTANCES' deve ser um número >= 1"
    errors=$((errors + 1))
fi

echo ""
echo "📋 Resumo da Validação:"
echo "========================================="

if [ $errors -eq 0 ]; then
    echo "✅ Configuração válida! Todas as verificações passaram."
    echo "🚀 Você pode prosseguir com o deploy: ./deploy.sh"
else
    echo "❌ $errors erro(s) encontrado(s) na configuração."
    echo "🔧 Corrija os erros acima antes de prosseguir."
    echo "💡 Consulte o arquivo .env.example para referência."
fi

echo ""
echo "🔗 Links úteis após o deploy:"
echo "  - Traefik Dashboard: http://localhost:${TRAEFIK_DASHBOARD_PORT:-8080}"
echo "  - Documentação: README.md"
echo "  - Scripts: ls *.sh"
