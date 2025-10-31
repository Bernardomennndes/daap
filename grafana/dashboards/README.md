# Grafana Dashboards - DAAP

Este diretório contém os dashboards pré-configurados do Grafana para monitoramento do sistema DAAP.

## Dashboards Disponíveis

### 1. Cache Strategy Comparison
**UID**: `cache-strategy-comparison`
**URL**: http://localhost:3000/d/cache-strategy-comparison

**Objetivo**: Comparar as 3 estratégias de eviction (LFU, LRU, Hybrid) lado a lado.

**Painéis** (8 total):

1. **Cache Hit Rate by Strategy** - Line chart
   - Taxa de acerto por estratégia ao longo do tempo
   - PromQL: `sum(rate(cache_hits_total[5m])) by (strategy) / sum(rate(cache_requests_total[5m])) by (strategy)`

2. **Current Hit Rate %** - Gauge
   - Taxa de acerto atual em %
   - Thresholds: Verde (>80%), Amarelo (50-80%), Vermelho (<50%)

3. **Request Rate (requests/min)** - Line chart
   - Throughput de requests por minuto
   - Segmentado por hit_type (normalized, fuzzy, miss)

4. **Cache Entries Count** - Line chart
   - Número de entries no cache por estratégia
   - Ajuda a identificar quando eviction é ativada (limite: 1000)

5. **Eviction Rate (evictions/min)** - Line chart
   - Frequência de evictions executadas
   - Indica sobrecarga do cache

6. **Eviction Duration (P95 & P50)** - Line chart
   - Latência de operações de eviction
   - P95 e P50 em segundos

7. **Entries Removed per Eviction (P95 & P50)** - Line chart
   - Quantas entries são removidas em cada eviction
   - Default batch size: 50

8. **Hit Type Distribution (Normalized vs Fuzzy)** - Stacked area
   - Proporção de hits normalizados vs fuzzy
   - Mostra eficácia do fuzzy matching

**Tags**: `cache`, `eviction`, `performance`
**Refresh**: 10 segundos
**Time range**: Última 1 hora

---

### 2. Service Performance Overview
**UID**: `service-performance`
**URL**: http://localhost:3000/d/service-performance

**Objetivo**: Visão geral da performance dos serviços e saúde do cache.

**Painéis** (9 total):

1. **Cache GET Operation Latency** - Line chart
   - P95 e P50 de latência de operações GET
   - Thresholds: Verde (<10ms), Amarelo (10-100ms), Vermelho (>100ms)

2. **Cache Latency P95 (ms)** - Gauge
   - Latência atual P95 em milissegundos
   - Indicador rápido de performance

3. **Cache Utilization %** - Line chart
   - Porcentagem de utilização do cache por estratégia
   - 100% = limite de eviction atingido

4. **Cache Entries Count** - Bar gauge
   - Número de entries atual (horizontal bars)
   - Limite visual em 1000

5. **Request Distribution by Type (per minute)** - Stacked bars
   - Distribuição de requests por tipo (normalized, fuzzy, miss)
   - Agregado por minuto

6-9. **Stat Cards** (últimas 1 hora):
   - **Total Requests**: Número total de requests
   - **Total Cache Hits**: Número total de hits (verde)
   - **Total Cache Misses**: Número total de misses (vermelho)
   - **Total Evictions**: Número total de evictions (laranja)

**Tags**: `cache`, `performance`, `service`
**Refresh**: 10 segundos
**Time range**: Última 1 hora

---

## Acesso

### Primeiro acesso

1. **Iniciar o stack completo**:
   ```bash
   docker-compose up -d --build
   ```

2. **Aguardar serviços iniciarem** (~30 segundos):
   ```bash
   docker-compose ps
   # Todos devem estar "healthy"
   ```

3. **Acessar Grafana**:
   ```
   http://localhost:3000
   ```

4. **Login**:
   - Username: `admin`
   - Password: `admin`
   - Você será solicitado a trocar a senha no primeiro login

5. **Navegar para dashboards**:
   - Menu lateral > Dashboards > Browse
   - Ou acesse diretamente via URLs acima

### Verificar se métricas estão chegando

1. Acesse **Explore** no menu lateral
2. Selecione datasource **Prometheus**
3. Execute query de teste:
   ```promql
   cache_requests_total
   ```
4. Você deve ver séries temporais com labels `strategy` e `hit_type`

---

## Métricas Disponíveis

### Counters (monotonicamente crescentes)
```promql
cache_requests_total{strategy, hit_type}    # Total de requests
cache_hits_total{strategy, type}            # Total de hits
cache_misses_total{strategy}                # Total de misses
cache_evictions_total{strategy}             # Total de evictions
```

### Gauges (valores atuais)
```promql
cache_entries_current{strategy}             # Número de entries
cache_utilization_percent{strategy}         # Utilização em %
```

### Histograms (distribuições)
```promql
cache_operation_duration_seconds_bucket{operation, strategy}
cache_eviction_duration_seconds_bucket{strategy}
cache_eviction_entries_removed_bucket{strategy}
```

---

## Queries PromQL Úteis

### Taxa de cache hit
```promql
sum(rate(cache_hits_total[5m])) by (strategy) /
sum(rate(cache_requests_total[5m])) by (strategy) * 100
```

### Latência P99 de GET
```promql
histogram_quantile(0.99, rate(cache_operation_duration_seconds_bucket{operation="get"}[5m]))
```

### Evictions por minuto
```promql
rate(cache_evictions_total[1m]) * 60
```

### Comparar estratégias (hit rate)
```promql
(
  sum(rate(cache_hits_total{strategy="lfu"}[5m])) /
  sum(rate(cache_requests_total{strategy="lfu"}[5m]))
) - (
  sum(rate(cache_hits_total{strategy="lru"}[5m])) /
  sum(rate(cache_requests_total{strategy="lru"}[5m]))
)
```
> Resultado positivo = LFU melhor, negativo = LRU melhor

### Proporção normalized vs fuzzy hits
```promql
sum(rate(cache_hits_total{type="fuzzy"}[5m])) /
sum(rate(cache_hits_total[5m])) * 100
```

---

## Customização

### Editar dashboards

1. Abra o dashboard desejado
2. Clique no ícone de engrenagem (⚙️) no canto superior direito
3. **Settings** > **JSON Model**
4. Copie o JSON editado para o arquivo correspondente neste diretório
5. Rebuild containers: `docker-compose up -d --build grafana`

### Adicionar novo painel

1. No dashboard, clique em **Add** > **Visualization**
2. Selecione datasource **Prometheus**
3. Digite query PromQL
4. Configure visualização (tipo, cores, thresholds)
5. Salve o painel
6. Exporte JSON (Settings > JSON Model) e salve neste diretório

### Adicionar novo dashboard

1. Crie dashboard no Grafana UI
2. Configure painéis
3. **Dashboard settings** > **JSON Model**
4. Copie JSON completo
5. Salve como `grafana/dashboards/my-dashboard.json`
6. Rebuild: `docker-compose up -d --build grafana`

---

## Troubleshooting

### Dashboards não aparecem

```bash
# Verificar se Grafana iniciou corretamente
docker-compose logs grafana | grep provisioning

# Deve mostrar:
# "Provisioning datasources"
# "Provisioning dashboards"
```

### Métricas não carregam (No Data)

```bash
# 1. Verificar se Prometheus está scrapando
curl http://localhost:9090/api/v1/targets

# Deve mostrar 3 targets UP:
# - reviews-service:9464
# - cache-service:9464
# - search-service:9464

# 2. Verificar se serviços expõem métricas
curl http://localhost:9464/metrics

# Deve retornar métricas OpenTelemetry
```

### Datasource não conecta

```bash
# Verificar se Prometheus está acessível
docker exec daap-grafana ping prometheus

# Verificar datasource no Grafana
# Configuration > Data sources > Prometheus > Test
```

### Painel vazio mas query está correta

- **Causa**: Time range do dashboard pode estar antes dos dados coletados
- **Solução**: Ajuste time range para "Last 5 minutes" ou "Last 15 minutes"

---

## Performance Tips

### Para testes de carga

1. **Gerar tráfego**:
   ```bash
   cd packages/tools/load-testing
   pnpm test:bulk 5000 10
   ```

2. **Ver métricas em tempo real**:
   - Abra dashboard "Cache Strategy Comparison"
   - Ajuste refresh para 5 segundos
   - Time range: "Last 5 minutes"

3. **Comparar estratégias**:
   ```bash
   # Testar com LFU
   echo "EVICTION_STRATEGY=lfu" >> .env
   docker-compose up -d --build cache-service

   # Fazer testes de carga
   # Anotar métricas do Grafana

   # Repetir para LRU e Hybrid
   ```

### Para desenvolvimento

- **Refresh automático**: 10-30 segundos
- **Time range**: Last 15 minutes ou Last 1 hour
- Use **Live** mode para debugging em tempo real

---

## Documentação Adicional

- **Prometheus Queries**: [PROMETHEUS_GRAFANA_IMPLEMENTATION_PLAN.md](../../PROMETHEUS_GRAFANA_IMPLEMENTATION_PLAN.md)
- **Estratégias de Eviction**: [apps/cache-service/EVICTION_STRATEGIES.md](../../apps/cache-service/EVICTION_STRATEGIES.md)
- **Cache Optimization**: [apps/cache-service/CACHE_OPTIMIZATION.md](../../apps/cache-service/CACHE_OPTIMIZATION.md)
- **Grafana Docs**: https://grafana.com/docs/grafana/latest/
- **PromQL Cheatsheet**: https://promlabs.com/promql-cheat-sheet/
