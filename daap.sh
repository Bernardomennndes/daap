#!/bin/bash

# DAAP - Script de Gerenciamento Principal
# Este script fornece acesso fácil a todos os scripts de gerenciamento do DAAP

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_PATH="$SCRIPT_DIR/scripts"

# Função para mostrar ajuda
show_help() {
    echo "🎯 DAAP - Sistema de Gerenciamento"
    echo "=================================="
    echo ""
    echo "Uso: ./daap.sh <comando> [argumentos...]"
    echo ""
    echo "📋 Comandos disponíveis:"
    echo ""
    echo "🔍 VERIFICAÇÕES:"
    echo "  check          # Verificar pré-requisitos do sistema"
    echo "  validate       # Validar configuração .env"
    echo "  info           # Ver informações de configuração"
    echo ""
    echo "🚀 DEPLOY E GERENCIAMENTO:"
    echo "  deploy [N]     # Deploy com N instâncias (padrão: 3)"
    echo "  scale N        # Escalar para N instâncias"
    echo ""
    echo "📊 MONITORAMENTO:"
    echo "  monitor        # Status completo do sistema"
    echo "  logs [serviço] # Ver logs (all, reviews, cache, search, web, traefik)"
    echo ""
    echo "🧪 TESTES:"
    echo "  test [req] [concurrent] [url]  # Teste de carga"
    echo ""
    echo "📚 AJUDA:"
    echo "  help           # Mostrar esta ajuda"
    echo "  commands       # Mostrar guia de comandos rápidos"
    echo ""
    echo "💡 Exemplos:"
    echo "  ./daap.sh deploy 5        # Deploy com 5 instâncias"
    echo "  ./daap.sh scale 8         # Escalar para 8 instâncias"
    echo "  ./daap.sh logs reviews    # Ver logs do reviews service"
    echo "  ./daap.sh test 100 10     # Teste com 100 requisições, 10 concurrent"
}

# Verificar se o diretório de scripts existe
if [ ! -d "$SCRIPTS_PATH" ]; then
    echo "❌ Diretório de scripts não encontrado: $SCRIPTS_PATH"
    exit 1
fi

# Processar comando
case "${1:-help}" in
    "check")
        exec "$SCRIPTS_PATH/check-requirements.sh"
        ;;
    "validate")
        exec "$SCRIPTS_PATH/validate-env.sh"
        ;;
    "info")
        exec "$SCRIPTS_PATH/setup-info.sh"
        ;;
    "deploy")
        shift
        exec "$SCRIPTS_PATH/deploy.sh" "$@"
        ;;
    "scale")
        shift
        exec "$SCRIPTS_PATH/scale.sh" "$@"
        ;;
    "monitor")
        exec "$SCRIPTS_PATH/monitor.sh"
        ;;
    "logs")
        shift
        exec "$SCRIPTS_PATH/logs.sh" "$@"
        ;;
    "test")
        shift
        exec "$SCRIPTS_PATH/load-test.sh" "$@"
        ;;
    "commands")
        exec "$SCRIPTS_PATH/quick-commands.sh"
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "❌ Comando '$1' não reconhecido"
        echo ""
        show_help
        exit 1
        ;;
esac
