# Cache Performance Comparison Tool

Esta ferramenta compara a performance de consultas de cache entre diferentes sistemas (Redis, Dragonfly) com base nos resultados de testes de cache existentes. Inclui métricas avançadas de **Throughput (QPS)** e **Snapshotting Speed (MB/s)** baseadas nos benchmarks oficiais do Dragonfly.

## Funcionalidades

- 📊 Lê arquivos de resultado `cache-test-*.json`
- 🔍 Realiza consultas de timing em Redis e Dragonfly
- 📈 Gera relatórios comparativos de performance
- ⚡ Calcula médias e percentuais de melhoria
- 📋 Salva resultados em formato JSON estruturado
- 🚀 **NOVO**: Métricas de Throughput (QPS - Queries Per Second)
- 💾 **NOVO**: Métricas de Snapshotting Speed (MB/s)
- 🏆 **NOVO**: Análise comparativa baseada em benchmarks do Dragonfly

## Métricas Implementadas

### Throughput (QPS)
- **QPS Médio**: Consultas por segundo durante operação normal
- **QPS Pico**: Máximo throughput alcançável
- **Melhoria de Throughput**: Comparação com baseline estimado

### Snapshotting Speed
- **Velocidade de Snapshot**: MB/s durante operações BGSAVE
- **Duração do Snapshot**: Tempo total para completar snapshot
- **Eficiência de Memória**: Baseado nos benchmarks do Dragonfly

### Benchmarks de Referência (Dragonfly)
- **QPS**: Até 3.8M QPS em instâncias c6gn.16xlarge
- **Latência**: P99 < 1ms para a maioria das operações
- **Snapshot**: ~30% mais eficiente em memória que Redis
- **Throughput**: 25x superior ao Redis em cenários otimizados

## Estrutura dos Dados

### Arquivo de Entrada (cache-test-*.json)
```json
{
  "timestamp": "2025-10-04T14:48:17.344Z",
  "queryCount": 100,
  "concurrency": 5,
  "totalTime": 192308,
  "results": [
    {
      "success": true,
      "query": "xiaomi phone",
      "responseTime": 11717,
      "status": 200,
      "cached": false
    }
  ]
}
```

### Arquivo de Saída (cache-comparison-*.json)
```json
{
  "timestamp": "2025-10-20T...",
  "sourceFile": "cache-test-100-1759589297344.json",
  "totalQueries": 100,
  "availableServices": {
    "redis": true,
    "dragonfly": true
  },
  "summary": {
    "averageDefault": 8500,
    "averageRedis": 12,
    "averageDragonfly": 8,
    "redisVsDefault": "+99.9%",
    "dragonflyVsDefault": "+99.9%",
    "performanceMetrics": {
      "redis": {
        "averageQPS": 150000,
        "averageSnapshotSpeed": 150.5,
        "peakQPS": 200000,
        "throughputImprovement": "15000%"
      },
      "dragonfly": {
        "averageQPS": 3800000,
        "averageSnapshotSpeed": 750.0,
        "peakQPS": 3800000,
        "throughputImprovement": "380000%"
      }
    }
  },
  "results": [
    {
      "query": "xiaomi phone",
      "result": {
        "default": 11717,
        "redis": 15,
        "dragonfly": 12
      },
      "metrics": {
        "redis": {
          "qps": 148000,
          "snapshotSpeed": 145.2
        },
        "dragonfly": {
          "qps": 3750000,
          "snapshotSpeed": 742.8
        }
      }
    }
  ]
}
```

## Como Usar

### Pré-requisitos

1. **Instalar dependências:**
   ```bash
   cd packages/tools
   pnpm install
   ```

2. **Certificar que os serviços estão rodando:**
   - Redis rodando na porta 6379
   - Dragonfly rodando na porta 6380
   - `redis-cli` instalado e disponível no PATH

### Executar Comparação

#### Opção 1: Processar todos os arquivos
```bash
cd packages/tools
pnpm run cache-comparison
```

#### Opção 2: Processar arquivo específico (demo interativo)
```bash
cd packages/tools
pnpm run cache-comparison:single cache-test-100-1759589297344.json
```

#### Opção 3: Análise rápida de benchmark (NOVO)
```bash
cd packages/tools
pnpm run benchmark-analyzer
```

#### Opção 4: Execução direta
```bash
cd packages/tools
tsx load-testing/scripts/run-cache-comparison.ts
tsx load-testing/scripts/run-single-file-comparison.ts <nome-do-arquivo>
tsx load-testing/scripts/quick-benchmark-analyzer.ts
```

## Configuração

### Portas dos Serviços
As configurações padrão estão em `utils/cache.ts`:
- **Redis:** localhost:6379
- **Dragonfly:** localhost:6380

### Chaves de Cache
O sistema procura por chaves no formato: `search:{query}`

## Saída Esperada

### Para análise rápida de benchmark:
```
� Cache Performance Benchmark Analysis
════════════════════════════════════════════════════════════════════════════════
[2025-10-20 ...] [INFO    ] 🚀 Iniciando análise rápida de benchmark
[2025-10-20 ...] [INFO    ] Redis disponível: ✅
[2025-10-20 ...] [INFO    ] Dragonfly disponível: ✅

                              Benchmark Redis                               
[2025-10-20 ...] [INFO    ] 📊 Analisando Redis em localhost:6379
[2025-10-20 ...] [SUCCESS ] ✅ Redis - Latência: 12ms
[2025-10-20 ...] [INFO    ] 📈 Redis - QPS: 150,000
[2025-10-20 ...] [INFO    ] 🔥 Redis - QPS Pico: 200,000
[2025-10-20 ...] [INFO    ] 💾 Redis - Snapshot Speed: 150.5 MB/s

                            Benchmark Dragonfly                            
[2025-10-20 ...] [INFO    ] 📊 Analisando Dragonfly em localhost:6380
[2025-10-20 ...] [SUCCESS ] ✅ Dragonfly - Latência: 8ms
[2025-10-20 ...] [INFO    ] � Dragonfly - QPS: 3,800,000
[2025-10-20 ...] [INFO    ] 🔥 Dragonfly - QPS Pico: 3,800,000
[2025-10-20 ...] [INFO    ] 💾 Dragonfly - Snapshot Speed: 750.0 MB/s

                         Comparação Dragonfly vs Redis                      
[2025-10-20 ...] [SUCCESS ] � Latência: Dragonfly é 33.3% mais rápido
[2025-10-20 ...] [SUCCESS ] 📊 QPS: Dragonfly é 25.3x mais eficiente
[2025-10-20 ...] [SUCCESS ] 🔥 QPS Pico: Dragonfly é 19.0x superior
[2025-10-20 ...] [SUCCESS ] 💾 Snapshot: Dragonfly é 5.0x mais rápido

Comparação Detalhada
====================
┌─────────┬────────────────────┬───────────────┬─────────────────┬───────────┐
│ (index) │      Métrica       │     Redis     │    Dragonfly    │ Melhoria  │
├─────────┼────────────────────┼───────────────┼─────────────────┼───────────┤
│    0    │   'Latência (ms)'  │      12       │        8        │ '33.3%'   │
│    1    │       'QPS'        │   '150,000'   │   '3,800,000'   │ '25.3x'   │
│    2    │    'QPS Pico'      │   '200,000'   │   '3,800,000'   │ '19.0x'   │
│    3    │ 'Snapshot (MB/s)'  │     150.5     │      750.0      │  '5.0x'   │
└─────────┴────────────────────┴───────────────┴─────────────────┴───────────┘
```

### Para arquivo específico (expandido):
```
🔍 Cache Result Comparison Tool
================================
[2025-10-20 ...] [INFO    ] Processando arquivo específico: cache-test-100-1759589297344.json
[2025-10-20 ...] [INFO    ] Redis disponível: ✅
[2025-10-20 ...] [INFO    ] Dragonfly disponível: ✅

─────────────────────── Resumo de Performance ───────────────────────
[2025-10-20 ...] [INFO    ] 📈 Tempo médio original: 8500ms
[2025-10-20 ...] [INFO    ] 🔴 Tempo médio Redis: 12ms (+99.9%)
[2025-10-20 ...] [INFO    ] Redis - QPS médio: 150,000
[2025-10-20 ...] [INFO    ] Redis - QPS pico: 200,000
[2025-10-20 ...] [INFO    ] Redis - Snapshot Speed: 150.5 MB/s
[2025-10-20 ...] [INFO    ] Redis - Melhoria de Throughput: 12500%
[2025-10-20 ...] [INFO    ] 🐲 Tempo médio Dragonfly: 8ms (+99.9%)
[2025-10-20 ...] [INFO    ] Dragonfly - QPS médio: 3,800,000
[2025-10-20 ...] [INFO    ] Dragonfly - QPS pico: 3,800,000
[2025-10-20 ...] [INFO    ] Dragonfly - Snapshot Speed: 750.0 MB/s
[2025-10-20 ...] [INFO    ] Dragonfly - Melhoria de Throughput: 380000%
[2025-10-20 ...] [SUCCESS ] Dragonfly vs Redis - QPS: 25.3x melhor
[2025-10-20 ...] [SUCCESS ] Dragonfly vs Redis - Snapshot Speed: 5.0x melhor
```

## Arquivos Gerados

Os relatórios são salvos no diretório `results/` com o formato:
- `cache-comparison-{arquivo-original}-{timestamp}.json`

## Troubleshooting

### Erro: Serviços indisponíveis
- Verificar se Redis/Dragonfly estão rodando
- Testar conexão: `redis-cli -h localhost -p 6379 ping`

### Erro: redis-cli não encontrado  
- Instalar redis-tools: `brew install redis` (macOS)

### Erro: Arquivo não encontrado
- Verificar se existem arquivos `cache-test-*.json` em `results/`
- Usar o nome completo do arquivo

## Estrutura dos Utilitários

- **`utils/cache.ts`**: Gerenciamento de conexão, consultas aos caches e **métricas de throughput/snapshot**
- **`utils/cli.ts`**: Execução de comandos do sistema
- **`utils/logger.ts`**: Sistema de logging formatado com tabelas
- **`scripts/cache-result-comparison.ts`**: Script principal de comparação com métricas avançadas
- **`scripts/run-single-file-comparison.ts`**: Demo interativo para arquivo único
- **`scripts/quick-benchmark-analyzer.ts`**: **NOVO** - Análise rápida de benchmark com métricas QPS e Snapshot