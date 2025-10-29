# Cache Eviction Strategies

Este documento explica as diferentes estratégias de eviction de cache implementadas no DAAP e como alternar entre elas.

## Arquitetura Desacoplada

O sistema de invalidação de cache foi projetado com base em abstrações, permitindo alternar entre diferentes estratégias sem modificar código:

```
EvictionStrategy (interface abstrata)
    ↑
    ├── LFUStrategy (Least Frequently Used)
    ├── LRUStrategy (Least Recently Used)
    └── HybridStrategy (LFU + LRU)
```

## Estratégias Disponíveis

### 1. LFU (Least Frequently Used) - Padrão

**Quando usar**: Ideal para workloads onde queries populares devem permanecer em cache, independente de quando foram acessadas.

**Como funciona**:
- Remove entries com **menor frequência de acesso**
- Considera também a idade do entry como fator secundário
- Fórmula: `score = (1 / (frequency + 1)) + (age_in_hours * 0.1)`
- **Maior score = evict primeiro**

**Exemplo**:
```typescript
// Entry com freq=1, idade=24h → score = 0.5 + 2.4 = 2.9 (evict)
// Entry com freq=99, idade=1h → score = 0.01 + 0.1 = 0.11 (keep)
```

**Variáveis de ambiente**:
```bash
EVICTION_STRATEGY=lfu
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50
```

**Vantagens**:
- Protege queries populares
- Boa para workloads com padrões de acesso consistentes
- Maximiza hit rate em queries frequentes

**Desvantagens**:
- Entries antigos mas populares podem nunca ser removidos
- Pode manter dados obsoletos em cache

---

### 2. LRU (Least Recently Used)

**Quando usar**: Ideal para workloads temporais onde dados recentes são mais importantes que popularidade.

**Como funciona**:
- Remove entries com **acesso mais antigo**
- Ignora completamente a frequência de acesso
- Fórmula: `score = time_since_last_access` (milissegundos)
- **Maior score = mais tempo sem acesso = evict primeiro**

**Exemplo**:
```typescript
// Entry A: último acesso há 5 minutos → score = 300000ms (evict)
// Entry B: último acesso há 10 segundos → score = 10000ms (keep)
// Frequência não importa!
```

**Variáveis de ambiente**:
```bash
EVICTION_STRATEGY=lru
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50
```

**Vantagens**:
- Mantém dados recentes em cache
- Bom para workloads com mudanças temporais
- Remove dados obsoletos rapidamente

**Desvantagens**:
- Queries populares mas antigas podem ser removidas
- Um burst de queries pode limpar todo o cache

---

### 3. Hybrid (LFU + LRU)

**Quando usar**: Workloads mistos onde tanto popularidade quanto recência são importantes.

**Como funciona**:
- Combina **frequência** e **recência** com pesos configuráveis
- Fórmula ponderada:
  ```typescript
  freq_score = 1 / (frequency + 1)  // Menor freq = maior score
  recency_score = age_in_hours * 0.1  // Mais antigo = maior score

  score = (weight_freq * freq_score) + (weight_recency * recency_score)
  ```
- **Pesos padrão**: 60% frequência, 40% recência

**Exemplo**:
```typescript
// Com weights: freq=0.6, recency=0.4
// Entry A: freq=5, idade=10h
//   → score = (0.6 * 0.167) + (0.4 * 1.0) = 0.5
// Entry B: freq=50, idade=2h
//   → score = (0.6 * 0.02) + (0.4 * 0.2) = 0.092
// Entry A removido primeiro (score maior)
```

**Variáveis de ambiente**:
```bash
EVICTION_STRATEGY=hybrid
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50

# Ajustar pesos (devem somar ~1.0)
EVICTION_FREQUENCY_WEIGHT=0.6  # 60% peso para frequência
EVICTION_RECENCY_WEIGHT=0.4    # 40% peso para recência
```

**Exemplos de configuração**:
```bash
# Mais agressivo com recência (favorece dados recentes)
EVICTION_FREQUENCY_WEIGHT=0.3
EVICTION_RECENCY_WEIGHT=0.7

# Mais agressivo com frequência (favorece dados populares)
EVICTION_FREQUENCY_WEIGHT=0.8
EVICTION_RECENCY_WEIGHT=0.2
```

**Vantagens**:
- Balanceia popularidade e recência
- Configurável para diferentes workloads
- Melhor desempenho geral em workloads mistos

**Desvantagens**:
- Mais complexo de ajustar
- Requer monitoramento para encontrar pesos ideais

---

## Como Alternar Entre Estratégias

### 1. Via Variável de Ambiente

Edite o arquivo `.env`:
```bash
# LFU (padrão)
EVICTION_STRATEGY=lfu

# LRU
EVICTION_STRATEGY=lru

# Hybrid
EVICTION_STRATEGY=hybrid
```

Reinicie o Cache Service:
```bash
pnpm --filter @daap/cache-service start:dev

# Ou via Docker
docker-compose restart cache-service
```

### 2. Via Docker Compose

No `docker-compose.yml`, adicione/modifique no serviço `cache-service`:
```yaml
cache-service:
  environment:
    - EVICTION_STRATEGY=hybrid
    - EVICTION_FREQUENCY_WEIGHT=0.7
    - EVICTION_RECENCY_WEIGHT=0.3
```

### 3. Verificar Estratégia Ativa

```bash
# Consultar info do cache
curl http://cache.localhost/cache/stats/info

# Response inclui:
{
  "totalEntries": 450,
  "maxEntries": 1000,
  "utilizationPercentage": 45,
  "topKeywords": [...],
  "strategyName": "Hybrid"  // ← Estratégia ativa
}
```

---

## Comparando Estratégias

### Cenário 1: Workload com Queries Repetitivas

**Exemplo**: E-commerce com produtos populares

| Query | Frequência | Última vez | LFU | LRU | Hybrid |
|-------|-----------|-----------|-----|-----|--------|
| "iphone" | 1000x | 10min | ✅ Keep | ✅ Keep | ✅ Keep |
| "laptop" | 500x | 24h | ✅ Keep | ❌ Evict | ⚠️ Maybe |
| "cabo usb" | 2x | 5min | ❌ Evict | ✅ Keep | ⚠️ Maybe |

**Vencedor**: LFU (maximiza hit rate em queries populares)

### Cenário 2: Workload com Mudanças Temporais

**Exemplo**: Sistema de notícias com eventos recentes

| Query | Frequência | Última vez | LFU | LRU | Hybrid |
|-------|-----------|-----------|-----|-----|--------|
| "eleições 2020" | 10000x | 30 dias | ✅ Keep | ❌ Evict | ❌ Evict |
| "copa 2024" | 50x | 1h | ❌ Evict | ✅ Keep | ✅ Keep |
| "notícias hoje" | 200x | 5min | ✅ Keep | ✅ Keep | ✅ Keep |

**Vencedor**: LRU ou Hybrid (remove dados obsoletos)

### Cenário 3: Workload Misto

**Exemplo**: Sistema acadêmico com queries sazonais + populares

| Query | Frequência | Última vez | LFU | LRU | Hybrid |
|-------|-----------|-----------|-----|-----|--------|
| "matrícula" | 5000x | 6 meses | ✅ Keep | ❌ Evict | ⚠️ Evict |
| "notas finais" | 3000x | 1 semana | ✅ Keep | ✅ Keep | ✅ Keep |
| "calendário" | 100x | 1 dia | ❌ Evict | ✅ Keep | ✅ Keep |

**Vencedor**: Hybrid com weights ajustados para o semestre

---

## Monitoramento e Ajuste

### Métricas Importantes

1. **Cache Hit Rate**
   ```bash
   # Via logs do Cache Service
   docker logs daap-cache-service | grep "Cache hit"
   ```

2. **Eviction Frequency**
   ```bash
   # Ver logs de eviction
   docker logs daap-cache-service | grep "Evicting"
   ```

3. **Keyword Statistics**
   ```bash
   # Top 50 keywords mais acessados
   curl http://cache.localhost/cache/stats/keywords?limit=50
   ```

### Ajustando Estratégia Hybrid

**Passo 1**: Analise os padrões de acesso
```bash
curl http://cache.localhost/cache/stats/keywords?limit=100 | jq
```

**Passo 2**: Identifique o perfil
- Muitas queries com alta frequência? → Aumentar `EVICTION_FREQUENCY_WEIGHT`
- Queries com mudanças rápidas? → Aumentar `EVICTION_RECENCY_WEIGHT`

**Passo 3**: Ajuste os pesos
```bash
# Para workload temporal
EVICTION_FREQUENCY_WEIGHT=0.3
EVICTION_RECENCY_WEIGHT=0.7

# Para workload estável
EVICTION_FREQUENCY_WEIGHT=0.8
EVICTION_RECENCY_WEIGHT=0.2
```

**Passo 4**: Monitore hit rate e ajuste

---

## Performance Esperada

Com base nos testes do projeto ([RESULTS.md](../../RESULTS.md)):

| Métrica | Sem Cache | LFU | LRU | Hybrid |
|---------|-----------|-----|-----|--------|
| Avg Response | 7580ms | 8ms | ~8ms | ~8ms |
| Hit Rate (queries populares) | 0% | 99% | 85% | 95% |
| Hit Rate (queries temporais) | 0% | 70% | 95% | 90% |
| CPU Usage | 95% | 8% | 8% | 10% |

**Nota**: Performance varia com workload específico.

---

## Testes Automatizados

### Testar Estratégias Localmente

```bash
# 1. LFU
export EVICTION_STRATEGY=lfu
pnpm --filter @daap/cache-service test

# 2. LRU
export EVICTION_STRATEGY=lru
pnpm --filter @daap/cache-service test

# 3. Hybrid
export EVICTION_STRATEGY=hybrid
pnpm --filter @daap/cache-service test
```

### Load Testing

```bash
cd packages/tools/load-testing

# Teste com LFU
docker-compose up -d
export EVICTION_STRATEGY=lfu
docker-compose restart cache-service
pnpm test:bulk 5000 10

# Teste com LRU
export EVICTION_STRATEGY=lru
docker-compose restart cache-service
pnpm test:bulk 5000 10

# Compare resultados
pnpm compare:cache
```

---

## Troubleshooting

### Estratégia não mudou após configurar

**Sintoma**: `strategyName` ainda mostra estratégia antiga

**Solução**:
```bash
# 1. Verificar variável foi lida
docker exec daap-cache-service env | grep EVICTION_STRATEGY

# 2. Reiniciar serviço
docker-compose restart cache-service

# 3. Verificar logs de inicialização
docker logs daap-cache-service | grep "Strategy initialized"
# Deve mostrar: "LFU Strategy initialized" ou similar
```

### Cache crescendo além do limite

**Sintoma**: `totalEntries > maxEntries` persistente

**Causas possíveis**:
1. `EVICTION_MAX_ENTRIES` não configurado
2. Redis/Dragonfly desconectado
3. Eviction está falhando

**Solução**:
```bash
# Ver logs de erro
docker logs daap-cache-service | grep "Error"

# Forçar eviction manual
curl -X POST "http://cache.localhost/cache/evict?count=100"

# Verificar conexão com Redis
docker exec daap-cache-service redis-cli ping
```

### Performance pior com estratégia

**Sintoma**: Hit rate caiu após mudar estratégia

**Análise**:
```bash
# 1. Limpar cache e recomeçar
curl -X DELETE http://cache.localhost/cache/invalidate

# 2. Rodar carga de teste
cd packages/tools/load-testing
pnpm test:bulk 1000 5

# 3. Analisar keywords
pnpm analyze:keywords

# 4. Ajustar estratégia baseado no perfil
```

---

## Referências

- [Cache Service Implementation](src/modules/cache/service.ts)
- [LFU Strategy](src/lib/cache/strategies/lfu.strategy.ts)
- [LRU Strategy](src/lib/cache/strategies/lru.strategy.ts)
- [Hybrid Strategy](src/lib/cache/strategies/hybrid.strategy.ts)
- [Eviction Strategy Interface](src/lib/cache/eviction-strategy.interface.ts)
- [Performance Results](../../RESULTS.md)
