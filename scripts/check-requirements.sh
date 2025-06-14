#!/bin/bash

# Mudar para o diretório do projeto (um nível acima do diretório scripts)
cd "$(dirname "$0")/.."

echo "🔍 DAAP - Verificação de Pré-requisitos"
echo "========================================"
echo ""

# Verificar se o Docker está instalado e rodando
echo "🐳 Verificando Docker..."
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        docker_version=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        echo "✅ Docker instalado e rodando (versão: $docker_version)"
    else
        echo "❌ Docker instalado mas não está rodando"
        echo "💡 Execute: systemctl start docker (Linux) ou inicie o Docker Desktop"
        exit 1
    fi
else
    echo "❌ Docker não está instalado"
    echo "💡 Instale Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Verificar se o Docker Compose está disponível
echo ""
echo "🔧 Verificando Docker Compose..."
if docker compose version &> /dev/null; then
    compose_version=$(docker compose version --short)
    echo "✅ Docker Compose disponível (versão: $compose_version)"
elif command -v docker-compose &> /dev/null; then
    compose_version=$(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)
    echo "✅ Docker Compose disponível (versão: $compose_version)"
    echo "ℹ️  Usando docker-compose (versão legacy)"
else
    echo "❌ Docker Compose não está disponível"
    echo "💡 Instale Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Verificar se as portas necessárias estão livres
echo ""
echo "🔌 Verificando portas disponíveis..."
ports_to_check=(80 443 3001 3002 3003 6379 8080 27017)
blocked_ports=()

for port in "${ports_to_check[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        blocked_ports+=($port)
    fi
done

if [ ${#blocked_ports[@]} -eq 0 ]; then
    echo "✅ Todas as portas necessárias estão disponíveis"
else
    echo "⚠️  Algumas portas estão em uso:"
    for port in "${blocked_ports[@]}"; do
        process=$(lsof -Pi :$port -sTCP:LISTEN -t | head -1)
        process_name=$(ps -p $process -o comm= 2>/dev/null || echo "desconhecido")
        echo "  - Porta $port: processo $process ($process_name)"
    done
    echo ""
    echo "💡 Para liberar portas:"
    echo "  - Pare os processos usando as portas"
    echo "  - Ou modifique as portas no arquivo .env"
fi

# Verificar espaço em disco
echo ""
echo "💾 Verificando espaço em disco..."
available_space=$(df -h . | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "${available_space%.*}" -ge 5 ]; then
    echo "✅ Espaço em disco suficiente (${available_space}B disponível)"
else
    echo "⚠️  Pouco espaço em disco (${available_space}B disponível)"
    echo "💡 Recomendado: pelo menos 5GB livres"
fi

# Verificar memória RAM
echo ""
echo "🧠 Verificando memória RAM..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    total_ram=$(system_profiler SPHardwareDataType | grep "Memory:" | awk '{print $2}')
    echo "ℹ️  Memória total: ${total_ram}B"
    if [ "${total_ram%.*}" -ge 8 ]; then
        echo "✅ Memória RAM suficiente"
    else
        echo "⚠️  Pouca memória RAM (recomendado: 8GB+)"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    total_ram=$(free -h | awk 'NR==2{print $2}')
    echo "ℹ️  Memória total: $total_ram"
    echo "✅ Verificação de RAM completada"
else
    echo "ℹ️  Sistema operacional não reconhecido para verificação de RAM"
fi

# Verificar conectividade de rede
echo ""
echo "🌐 Verificando conectividade..."
if ping -c 1 google.com &> /dev/null; then
    echo "✅ Conectividade com a internet disponível"
else
    echo "⚠️  Sem conectividade com a internet"
    echo "💡 Algumas funcionalidades podem não funcionar"
fi

# Verificar se os arquivos de configuração existem
echo ""
echo "📁 Verificando arquivos de configuração..."
config_files=(".env" "docker-compose.yml" "traefik.yml" "hosts-local.txt")
missing_files=()

for file in "${config_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file encontrado"
    else
        echo "❌ $file não encontrado"
        missing_files+=($file)
    fi
done

# Verificar hosts locais
echo ""
echo "🏠 Verificando configuração de hosts..."
hosts_configured=true
required_hosts=("daap.localhost" "reviews.localhost" "cache.localhost" "search.localhost" "traefik.localhost")

for host in "${required_hosts[@]}"; do
    if ! grep -q "$host" /etc/hosts 2>/dev/null; then
        hosts_configured=false
        break
    fi
done

if [ "$hosts_configured" = true ]; then
    echo "✅ Hosts locais configurados"
else
    echo "⚠️  Hosts locais não configurados"
    echo "💡 Execute: sudo sh -c 'cat hosts-local.txt >> /etc/hosts'"
fi

# Resumo final
echo ""
echo "📋 Resumo da Verificação"
echo "========================================"

if [ ${#blocked_ports[@]} -eq 0 ] && [ ${#missing_files[@]} -eq 0 ]; then
    echo "✅ Sistema pronto para deploy!"
    echo ""
    echo "🚀 Próximos passos:"
    echo "  1. Configure hosts (se necessário): sudo sh -c 'cat hosts-local.txt >> /etc/hosts'"
    echo "  2. Valide configuração: ./validate-env.sh"
    echo "  3. Inicie o deploy: ./deploy.sh 3"
    echo "  4. Monitore o sistema: ./monitor.sh"
else
    echo "⚠️  Alguns problemas foram encontrados:"
    
    if [ ${#blocked_ports[@]} -gt 0 ]; then
        echo "  - Portas em uso: ${blocked_ports[*]}"
    fi
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        echo "  - Arquivos ausentes: ${missing_files[*]}"
    fi
    
    echo ""
    echo "🔧 Corrija os problemas acima antes de prosseguir"
fi

echo ""
echo "📚 Documentação disponível:"
echo "  - README.md (visão geral)"
echo "  - ENV_GUIDE.md (configuração de variáveis)"
echo "  - ./setup-info.sh (informações de configuração)"
