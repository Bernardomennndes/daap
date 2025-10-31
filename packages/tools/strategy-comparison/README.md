# Strategy Comparison Tool

Ferramenta automatizada para comparar as três estratégias de eviction do DAAP (LFU, LRU, Hybrid) através de métricas coletadas via **OpenTelemetry + Jaeger**.

## 📊 Arquitetura

```
┌─────────────────────┐
│   Load Test         │
│   (bulk-test-runner)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐      ┌──────────────────┐
│  Cache Service      │─────▶│  OpenTelemetry   │
│  (LFU/LRU/Hybrid)   │      │  Instrumentation │
└─────────────────────┘      └────────┬─────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │   Jaeger UI      │
                             │  (Traces Store)  │
                             └────────┬─────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │ Jaeger Collector │
                             │  (API Client)    │
                             └────────┬─────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │ Metrics Aggregator│
                             └────────┬─────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │ Report Generator │
                             │  (MD, CSV)       │
                             └──────────────────┘
```

## 🎯 Métricas Coletadas

### Por Estratégia:

- **Total de Evictions**: Número de vezes que eviction foi triggada
- **Duração Média/Min/Max (ms)**: Tempo de execução da eviction
- **Duração P50/P95/P99 (ms)**: Percentis de latência
- **Entries Evictadas (média/total)**: Quantas entries foram removidas
- **Score Médio**: Score médio das entries evictadas
- **Utilização Antes/Depois (%)**: % de uso do cache
- **Eficiência (entries/ms)**: Entries removidas por ms

### Via REST API:

- **Cache Hit Rate**: Taxas de hit (normalized/fuzzy/miss)

---

## 🚀 Pré-requisitos

- Docker e Docker Compose
- pnpm
- Node.js 18+
- Jaeger rodando (porta 16686)
- ts-node instalado globalmente: `npm install -g ts-node`

---

## 🏃 Uso Rápido

### 1. Teste Automatizado Completo

```bash
# Rodar teste completo com todas as 3 estratégias
./packages/tools/strategy-comparison/run-comparison-test.sh 5000 10

# Argumentos:
#   $1: Número de requests (default: 5000)
#   $2: Concurrency (default: 10)
```

**O que o script faz:**
1. Para serviços atuais
2. Para cada estratégia (LFU, LRU, Hybrid):
   - Atualiza `.env` com `EVICTION_STRATEGY`
   - Sobe infraestrutura limpa (MongoDB, Redis, Jaeger)
   - Sobe serviços DAAP
   - Executa load test
   - Aguarda traces serem exportados
3. Coleta traces do Jaeger
4. Agrega métricas
5. Gera relatórios comparativos (MD + CSV)

**Tempo estimado**: ~20-30 minutos (3 estratégias × 5000 requests)

**Output**:
```
packages/tools/results/
├── traces/
│   ├── lfu-eviction-metrics-2025-10-30T18-00-00.json
│   ├── lru-eviction-metrics-2025-10-30T18-10-00.json
│   └── hybrid-eviction-metrics-2025-10-30T18-20-00.json
├── comparison-report-2025-10-30T18-30-00.md
└── comparison-report-2025-10-30T18-30-00.csv
```

---

### 2. Coleta Manual

Se você já rodou testes e só quer coletar métricas:

```bash
cd packages/tools/strategy-comparison

# Coletar traces de uma estratégia específica
npx ts-node jaeger-collector.ts lfu 1 1000

# Argumentos:
#   $1: Estratégia (lfu/lru/hybrid)
#   $2: Lookback hours (default: 1)
#   $3: Limit traces (default: 1000)
```

**Output**: `packages/tools/results/traces/lfu-eviction-metrics-*.json`

---

### 3. Agregação Manual

```bash
cd packages/tools/strategy-comparison

# Agregar métricas de arquivo JSON
npx ts-node metrics-aggregator.ts ../results/traces/lfu-eviction-metrics-*.json
```

**Output**: JSON agregado no console

---

### 4. Comparação Manual

```bash
cd packages/tools/strategy-comparison

# Comparar todas as estratégias baseado em traces da última 1 hora
npx ts-node compare-strategies.ts 1
```

**Output**: Relatórios MD e CSV em `packages/tools/results/`

---

## 📁 Estrutura de Arquivos

```
packages/tools/strategy-comparison/
├── jaeger-collector.ts       # Coleta traces do Jaeger API
├── metrics-aggregator.ts     # Agrega métricas por estratégia
├── report-generator.ts       # Gera tabelas MD/CSV
├── compare-strategies.ts     # Script principal
├── run-comparison-test.sh    # Automação completa
└── README.md                 # Este arquivo

packages/tools/results/
├── traces/                   # JSONs brutos do Jaeger
│   ├── lfu-eviction-metrics-*.json
│   ├── lru-eviction-metrics-*.json
│   └── hybrid-eviction-metrics-*.json
└── comparison-report-*.{md,csv}  # Relatórios finais
```

---

## 📊 Exemplo de Relatório

### comparison-report-2025-10-30T18-30-00.md

```markdown
# Comparação de Estratégias de Eviction

**Data**: 2025-10-30T18:30:00.000Z

## Métricas Comparativas

| Métrica | LFU | LRU | HYBRID |
| --- | --- | --- | --- |
| **Total de Evictions** | 48 | 52 | 50 |
| **Duração Média (ms)** | 42.35 | 38.12 | 40.23 |
| **Duração Min (ms)** | 28 | 25 | 27 |
| **Duração Max (ms)** | 89 | 76 | 82 |
| **Duração P50 (ms)** | 41 | 37 | 39 |
| **Duração P95 (ms)** | 67 | 62 | 65 |
| **Duração P99 (ms)** | 85 | 74 | 80 |
| **Entries Evictadas (média)** | 50.00 | 50.00 | 50.00 |
| **Total Entries Evictadas** | 2400 | 2600 | 2500 |
| **Score Médio** | 2.3456 | 150234.00 | 1.8923 |
| **Utilização Antes (%)** | 102.50% | 103.20% | 102.80% |
| **Utilização Depois (%)** | 97.50% | 98.20% | 97.80% |
| **Eficiência (entries/ms)** | 1.1805 | 1.3116 | 1.2422 |

## Rankings

- 🏆 **Eviction Mais Rápida**: LRU
- 🏆 **Mais Eficiente**: LRU
- 🏆 **Melhor Utilização**: LFU
```

---

## 🔧 Troubleshooting

### ❌ Erro: "No eviction events found"

**Causa**: Cache não chegou no limite (`EVICTION_MAX_ENTRIES`) durante o teste.

**Soluções**:

```bash
# 1. Reduzir limite temporariamente (força evictions mais frequentes)
echo "EVICTION_MAX_ENTRIES=500" >> .env
docker-compose up -d --build cache-service

# 2. Aumentar número de requests
./run-comparison-test.sh 10000 10

# 3. Verificar se load test está rodando
docker-compose logs cache-service | grep "Evicting"
```

---

### ❌ Erro: "Cannot connect to Jaeger"

**Solução**:

```bash
# Verificar se Jaeger está rodando
docker ps | grep jaeger

# Subir Jaeger
docker-compose up -d jaeger

# Testar API
curl http://localhost:16686/api/services
# Expected output: ["cache-service","reviews-service","search-service"]
```

---

### ❌ Traces não aparecem no Jaeger

**Causa**: OpenTelemetry não exportou traces ainda (default: batch a cada 5s).

**Solução**:

```bash
# Aguardar mais tempo após load test
sleep 30

# Verificar logs do cache-service
docker-compose logs cache-service | grep "OpenTelemetry"
# Expected: "[OpenTelemetry] Initialized for service: cache-service"

# Verificar variáveis de ambiente
docker exec daap-cache-service env | grep OTEL
```

---

### ❌ Script bash falha: "sed: command not found"

**Causa**: Rodando em ambiente sem `sed`.

**Solução**:

```bash
# Editar .env manualmente antes de rodar testes individuais
echo "EVICTION_STRATEGY=lfu" >> .env
docker-compose up -d --build

# Rodar load test
cd packages/tools/load-testing
pnpm test:bulk 5000 10

# Coletar métricas
cd ../strategy-comparison
npx ts-node jaeger-collector.ts lfu 1 1000
```

---

## 💡 Workflow Recomendado

```bash
# 1. Rodar teste automatizado completo
./packages/tools/strategy-comparison/run-comparison-test.sh 5000 10

# 2. Analisar relatórios
cat packages/tools/results/comparison-report-*.md

# 3. Abrir Jaeger UI para análise visual
open http://localhost:16686

# 4. Filtrar traces no Jaeger:
#    - Service: cache-service
#    - Operation: cache.eviction.check
#    - Tags: {"eviction.strategy":"lfu"}
#    - Click "Find Traces"
```

---

## 🔬 Análise Avançada no Jaeger UI

### 1. Comparar Latências de Eviction

```
1. Service: cache-service
2. Operation: cache.eviction.check
3. Tags: eviction.triggered=true
4. Min Duration: 10ms (filtrar apenas evictions reais)
5. Group by: eviction.strategy
```

### 2. Identificar Evictions Lentas

```
1. Service: cache-service
2. Operation: cache.eviction.check
3. Min Duration: 100ms (threshold para "lentas")
4. Analisar trace detalhado
```

### 3. Correlacionar Cache Hits com Evictions

```
1. Buscar trace de request específico
2. Ver span "cache.get" → "cache.eviction.check"
3. Verificar se eviction afetou hit rate
```

---

## 🔄 Adicionando Novas Métricas

### 1. Adicionar attribute no span (cache-service)

```typescript
// apps/cache-service/src/lib/cache/strategies/*.strategy.ts
span.setAttributes({
  'eviction.new_metric': value,
});
```

### 2. Adicionar constant no telemetry package

```typescript
// packages/telemetry/src/constants.ts
export const EVICTION_NEW_METRIC = 'eviction.new_metric';
```

### 3. Atualizar collector

```typescript
// packages/tools/strategy-comparison/jaeger-collector.ts
interface EvictionMetrics {
  // ... existing fields
  newMetric: number;
}

// No método fetchEvictionTraces:
newMetric: tags['eviction.new_metric'] || 0,
```

### 4. Atualizar aggregator

```typescript
// packages/tools/strategy-comparison/metrics-aggregator.ts
const avgNewMetric = metrics.map(m => m.newMetric).reduce((a, b) => a + b, 0) / metrics.length;

return {
  // ... existing fields
  avgNewMetric: Number(avgNewMetric.toFixed(2)),
};
```

### 5. Atualizar report generator

```typescript
// packages/tools/strategy-comparison/report-generator.ts
['**Nova Métrica**', ...metricsArray.map(m => m.avgNewMetric.toFixed(2))],
```

### 6. Rebuild

```bash
pnpm --filter @daap/telemetry build
pnpm --filter @daap/cache-service build
docker-compose up -d --build cache-service
```

---

## 📚 Referências

- **OpenTelemetry Docs**: https://opentelemetry.io/docs/
- **Jaeger API**: https://www.jaegertracing.io/docs/latest/apis/
- **DAAP CLAUDE.md**: [../../CLAUDE.md](../../CLAUDE.md)
- **OpenTelemetry Implementation Guide**: [../../../OPENTELEMETRY_IMPLEMENTATION_COMPLETE.md](../../../OPENTELEMETRY_IMPLEMENTATION_COMPLETE.md)

---

## 🐛 Debug Mode

Para debug mais detalhado:

```bash
# Habilitar logs de debug do OpenTelemetry
export OTEL_LOG_LEVEL=debug

# Rodar script individual
cd packages/tools/strategy-comparison
npx ts-node jaeger-collector.ts lfu 1 1000

# Ver traces brutos
cat ../results/traces/lfu-eviction-metrics-*.json | jq '.'
```

---

## 🎓 Interpretação dos Resultados

### **Score Médio**

- **LFU**: Menor = melhor (remove entries com menor frequência)
- **LRU**: Maior = melhor (remove entries mais antigas em ms)
- **Hybrid**: Balanceado (combina frequência + recência)

**Nota**: Scores entre estratégias **NÃO são comparáveis diretamente** (diferentes fórmulas).

### **Eficiência (entries/ms)**

Quanto **maior**, mais entries são removidas por milissegundo → mais eficiente.

### **Utilização Após Eviction**

Quanto **menor**, melhor o "espaço liberado" → eviction mais agressiva.

---

**Developed by DAAP Team** | **Generated with Claude Code** 🤖
