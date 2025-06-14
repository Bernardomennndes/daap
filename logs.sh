#!/bin/bash

SERVICE=${1:-"all"}
LINES=${2:-50}

echo "📋 DAAP - Logs dos Serviços"
echo "================================"

case $SERVICE in
    "reviews")
        echo "🔍 Logs do Reviews Service (últimas $LINES linhas):"
        docker-compose logs --tail=$LINES -f reviews-service
        ;;
    "cache")
        echo "🔍 Logs do Cache Service (últimas $LINES linhas):"
        docker-compose logs --tail=$LINES -f cache-service
        ;;
    "search")
        echo "🔍 Logs do Search Service (últimas $LINES linhas):"
        docker-compose logs --tail=$LINES -f search-service
        ;;
    "web")
        echo "🔍 Logs do Web Interface (últimas $LINES linhas):"
        docker-compose logs --tail=$LINES -f web
        ;;
    "traefik")
        echo "🔍 Logs do Traefik (últimas $LINES linhas):"
        docker-compose logs --tail=$LINES -f traefik
        ;;
    "all")
        echo "🔍 Logs de todos os serviços (últimas $LINES linhas cada):"
        docker-compose logs --tail=$LINES -f
        ;;
    *)
        echo "❌ Serviço '$SERVICE' não reconhecido"
        echo ""
        echo "Uso: ./logs.sh [serviço] [número_de_linhas]"
        echo ""
        echo "Serviços disponíveis:"
        echo "  - reviews   : Logs do Reviews Service"
        echo "  - cache     : Logs do Cache Service"
        echo "  - search    : Logs do Search Service"
        echo "  - web       : Logs do Web Interface"
        echo "  - traefik   : Logs do Traefik"
        echo "  - all       : Logs de todos os serviços (padrão)"
        echo ""
        echo "Exemplos:"
        echo "  ./logs.sh reviews 100"
        echo "  ./logs.sh cache"
        echo "  ./logs.sh all"
        exit 1
        ;;
esac
