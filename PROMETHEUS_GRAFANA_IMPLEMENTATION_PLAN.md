# 📊 PLANO DE IMPLEMENTAÇÃO: Prometheus + Grafana
## Sistema de Métricas em Tempo Real para DAAP

---

## ✅ STATUS ATUAL (Implementado)

### Fase 1: Infraestrutura Base (COMPLETO)
- ✅ **Telemetry Package**: Módulos `metrics.ts` e `cache-metrics.ts` criados
- ✅ **Dependências**: @opentelemetry/sdk-metrics, exporter-prometheus, host-metrics
- ✅ **prometheus.yml**: Configuração de scrape dos 3 serviços

---

## 🚧 PRÓXIMAS ETAPAS (Pendentes)

### FASE 2: Instrumentar Serviços (2-3 horas)

#### 2.1. Cache Service

**Arquivo**: `apps/cache-service/src/main.ts`

```typescript
import './tracing'; // Já existe
import { initializeMetrics } from '@daap/telemetry'; // ADICIONAR

async function bootstrap() {
  // ADICIONAR: Inicializar Prometheus
  initializeMetrics({
    serviceName: 'cache-service',
    port: 9464,
    endpoint: '/metrics',
  });

  const app = await NestFactory.create(MainModule);
  // ... resto do código existente
}
```

**Arquivo**: `apps/cache-service/src/modules/cache/service.ts`

```typescript
import { CacheMetricsService } from '@daap/telemetry'; // ADICIONAR

export class CacheService {
  // ADICIONAR: Instância de métricas
  private readonly metrics = new CacheMetricsService('cache-service');

  constructor(/*...*/) {
    // ... código existente

    // ADICIONAR: Registrar callbacks para gauges observáveis
    this.metrics.registerEntriesGaugeCallback(async (strategy) => {
      const info = await this.evictionStrategy.getCacheInfo();
      return info.strategyName.toLowerCase() === strategy ? info.totalEntries : 0;
    });

    this.metrics.registerUtilizationGaugeCallback(async (strategy) => {
      const info = await this.evictionStrategy.getCacheInfo();
      return info.strategyName.toLowerCase() === strategy ? info.utilizationPercentage : 0;
    });
  }

  async get(query: string, page: number, size: number): Promise<SearchResult | null> {
    const startTime = Date.now();
    const strategy = this.evictionStrategy.getStrategyName().toLowerCase();

    // ... código existente de busca

    let hitType: 'normalized' | 'fuzzy' | 'miss' = 'miss';

    // Busca normalizada
    const cached = await this.cacheAdapter.get(key);
    if (cached) {
      hitType = 'normalized';
      // ADICIONAR: Registrar métrica
      this.metrics.recordRequest(strategy, hitType);
      this.metrics.recordOperationDuration('get', strategy, (Date.now() - startTime) / 1000);
      return JSON.parse(cached);
    }

    // Fuzzy matching
    if (this.FUZZY_ENABLED) {
      const fuzzyResult = await this.findPartialMatch(query, page, size);
      if (fuzzyResult) {
        hitType = 'fuzzy';
        // ADICIONAR: Registrar métrica
        this.metrics.recordRequest(strategy, hitType);
        this.metrics.recordOperationDuration('get', strategy, (Date.now() - startTime) / 1000);
        return fuzzyResult;
      }
    }

    // Cache miss
    this.metrics.recordRequest(strategy, hitType);
    this.metrics.recordOperationDuration('get', strategy, (Date.now() - startTime) / 1000);
    return null;
  }
}
```

**Arquivo**: `apps/cache-service/src/lib/cache/strategies/*.strategy.ts` (todas as 3)

```typescript
// ADICIONAR no construtor:
private metrics: CacheMetricsService | null = null;

constructor(/*...*/) {
  // ... código existente

  // ADICIONAR:
  try {
    this.metrics = new CacheMetricsService('cache-service');
  } catch (error) {
    // Metrics not initialized, silently ignore
  }
}

// MODIFICAR checkAndEvict():
async checkAndEvict(): Promise<boolean> {
  return this.tracing.startActiveSpan('cache.eviction.check', async (span) => {
    const startTime = Date.now();
    // ... código existente

    if (currentCount > this.config.maxEntries) {
      // ... código de eviction
      await this.evict(candidates);

      const duration = Date.now() - startTime;
      const entriesEvicted = currentCount - afterCount;

      // ADICIONAR: Registrar métricas Prometheus
      if (this.metrics) {
        const strategy = this.getStrategyName().toLowerCase();
        this.metrics.recordEviction(strategy);
        this.metrics.recordEvictionDuration(strategy, duration / 1000);
        this.metrics.recordEvictionEntriesRemoved(strategy, entriesEvicted);
      }

      return true;
    }
    return false;
  });
}
```

#### 2.2. Reviews e Search Services

Mesmo padrão:
1. Adicionar `initializeMetrics()` no `main.ts`
2. Métricas HTTP serão auto-instrumentadas pelo OpenTelemetry

---

### FASE 3: Docker Compose + Prometheus (30 min)

**Arquivo**: `docker-compose.yml`

```yaml
services:
  # ... serviços existentes

  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: daap-prometheus
    restart: unless-stopped
    ports:
      - "${PROMETHEUS_PORT:-9090}:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=${PROMETHEUS_RETENTION:-15d}'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    networks:
      - app_network
    depends_on:
      - reviews-service
      - cache-service
      - search-service
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:9090/-/healthy"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  # ... volumes existentes
  prometheus_data:
    driver: local
```

---

### FASE 4: Grafana Setup (45 min)

#### 4.1. Docker Compose

```yaml
  grafana:
    image: grafana/grafana:10.4.0
    container_name: daap-grafana
    restart: unless-stopped
    ports:
      - "${GRAFANA_PORT:-3000}:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}
      - GF_INSTALL_PLUGINS=grafana-piechart-panel
      - GF_AUTH_ANONYMOUS_ENABLED=false
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
    networks:
      - app_network
    depends_on:
      - prometheus

volumes:
  grafana_data:
    driver: local
```

#### 4.2. Provisioning - Datasource

**Arquivo**: `grafana/provisioning/datasources/prometheus.yml`

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      httpMethod: POST
      timeInterval: 15s
```

#### 4.3. Provisioning - Dashboards

**Arquivo**: `grafana/provisioning/dashboards/default.yml`

```yaml
apiVersion: 1

providers:
  - name: 'DAAP Dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
```

---

### FASE 5: Dashboards Grafana (1-2 horas)

#### 5.1. Dashboard: Cache Strategy Comparison

**Arquivo**: `grafana/dashboards/cache-strategy-comparison.json`

**Painéis Principais:**

1. **Cache Hit Rate por Estratégia** (Gauge Panel)
   ```promql
   sum(rate(cache_hits_total{strategy="lfu"}[5m])) /
   sum(rate(cache_requests_total{strategy="lfu"}[5m])) * 100
   ```

2. **Evictions por Estratégia** (Time Series)
   ```promql
   rate(cache_evictions_total[1m])
   ```

3. **Latência P95 de Eviction** (Stat Panel)
   ```promql
   histogram_quantile(0.95, rate(cache_eviction_duration_seconds_bucket[5m]))
   ```

4. **Entries Removidas por Eviction** (Bar Gauge)
   ```promql
   avg(cache_eviction_entries_removed) by (strategy)
   ```

5. **Utilização do Cache** (Time Series)
   ```promql
   cache_utilization_percent
   ```

6. **Distribuição de Cache Hits** (Pie Chart)
   ```promql
   sum(cache_hits_total) by (type)
   ```

#### 5.2. Dashboard: Service Performance

**Painéis:**

1. **Request Rate** (Time Series)
   ```promql
   sum(rate(http_server_duration_milliseconds_count[1m])) by (service)
   ```

2. **Latência P95** (Stat)
   ```promql
   histogram_quantile(0.95, rate(http_server_duration_milliseconds_bucket[5m]))
   ```

3. **Error Rate** (Time Series)
   ```promql
   sum(rate(http_server_duration_milliseconds_count{status_code=~"5.."}[1m]))
   ```

---

### FASE 6: Alertas Prometheus (30 min)

**Arquivo**: `prometheus/alerts.yml`

```yaml
groups:
  - name: cache_alerts
    interval: 30s
    rules:
      - alert: HighCacheMissRate
        expr: |
          sum(rate(cache_misses_total[5m])) by (strategy) /
          sum(rate(cache_requests_total[5m])) by (strategy) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High cache miss rate on {{ $labels.strategy }}"
          description: "Cache miss rate is {{ $value | humanizePercentage }}"

      - alert: SlowEviction
        expr: |
          histogram_quantile(0.95, rate(cache_eviction_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow cache eviction detected"
          description: "P95 eviction duration is {{ $value }}s"

      - alert: HighMemoryUsage
        expr: |
          cache_utilization_percent > 95
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Cache utilization critical on {{ $labels.strategy }}"
          description: "Cache is at {{ $value }}% capacity"
```

**Atualizar prometheus.yml:**

```yaml
# Adicionar ao final
rule_files:
  - '/etc/prometheus/alerts.yml'
```

---

### FASE 7: Environment Variables

**Arquivo**: `.env.example`

```bash
# Prometheus
PROMETHEUS_PORT=9090
PROMETHEUS_RETENTION=15d

# Grafana
GRAFANA_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin

# Metrics Endpoints (todos os serviços expõem em :9464)
METRICS_PORT=9464
```

---

### FASE 8: Documentação (1 hora)

**Arquivo**: `PROMETHEUS_GRAFANA_GUIDE.md`

**Seções:**
1. Introdução e Arquitetura
2. Quick Start (como subir tudo)
3. Acessar Dashboards
4. Métricas Disponíveis (lista completa com exemplos PromQL)
5. Criar Dashboards Customizados
6. Troubleshooting
7. Best Practices

**Atualizar**: `CLAUDE.md` com seção Prometheus + Grafana

---

## 📊 MÉTRICAS DISPONÍVEIS (Referência Rápida)

### Cache Metrics

| Métrica | Tipo | Descrição |
|---------|------|-----------|
| `cache_requests_total` | Counter | Total de requests (labels: strategy, hit_type) |
| `cache_hits_total` | Counter | Total de hits (labels: strategy, type) |
| `cache_misses_total` | Counter | Total de misses (labels: strategy) |
| `cache_evictions_total` | Counter | Total de evictions (labels: strategy) |
| `cache_entries_current` | Gauge | Entries atuais (labels: strategy) |
| `cache_utilization_percent` | Gauge | Utilização % (labels: strategy) |
| `cache_operation_duration_seconds` | Histogram | Latência de operações (labels: operation, strategy) |
| `cache_eviction_duration_seconds` | Histogram | Duração de evictions (labels: strategy) |
| `cache_eviction_entries_removed` | Histogram | Entries removidas (labels: strategy) |

### System Metrics (Auto-instrumentadas)

- `process_cpu_usage_ratio`
- `process_memory_usage_bytes`
- `nodejs_heap_size_total_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_gc_duration_seconds`

---

## 🎯 QUERIES PROMQL ÚTEIS

### Cache Hit Rate
```promql
sum(rate(cache_hits_total[5m])) by (strategy) /
sum(rate(cache_requests_total[5m])) by (strategy) * 100
```

### Evictions per Minute
```promql
rate(cache_evictions_total[1m]) * 60
```

### P95 Eviction Latency
```promql
histogram_quantile(0.95, rate(cache_eviction_duration_seconds_bucket[5m]))
```

### Average Entries Removed per Eviction
```promql
avg(cache_eviction_entries_removed) by (strategy)
```

### Cache Utilization Over Time
```promql
cache_utilization_percent
```

---

## 🚀 COMANDOS DE TESTE

### 1. Subir Stack Completa
```bash
docker-compose up -d --build
```

### 2. Acessar Interfaces
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)
- Métricas Raw:
  - http://cache.localhost:9464/metrics
  - http://reviews.localhost:9464/metrics
  - http://search.localhost:9464/metrics

### 3. Fazer Load Test
```bash
cd packages/tools/load-testing
pnpm test:bulk 1000 10
```

### 4. Ver Métricas no Prometheus
```bash
# Abrir Prometheus UI
open http://localhost:9090

# Query Example
sum(rate(cache_requests_total[5m])) by (strategy)
```

### 5. Ver Dashboard no Grafana
```bash
open http://localhost:3000/d/cache-strategy-comparison
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Infraestrutura ✅ (COMPLETO)
- [x] Adicionar dependências Prometheus ao telemetry
- [x] Criar metrics.ts
- [x] Criar cache-metrics.ts
- [x] Criar prometheus.yml

### Fase 2: Instrumentação ⏳ (PENDENTE)
- [ ] Instrumentar Cache Service main.ts
- [ ] Instrumentar Cache Service service.ts
- [ ] Instrumentar estratégias de eviction
- [ ] Instrumentar Reviews Service
- [ ] Instrumentar Search Service
- [ ] Build e testar todos os serviços

### Fase 3: Prometheus Docker ⏳ (PENDENTE)
- [ ] Adicionar service ao docker-compose.yml
- [ ] Adicionar volume prometheus_data
- [ ] Testar scrape dos 3 serviços

### Fase 4: Grafana Setup ⏳ (PENDENTE)
- [ ] Adicionar service ao docker-compose.yml
- [ ] Criar grafana/provisioning/datasources/
- [ ] Criar grafana/provisioning/dashboards/
- [ ] Adicionar volume grafana_data

### Fase 5: Dashboards ⏳ (PENDENTE)
- [ ] Criar cache-strategy-comparison.json
- [ ] Criar service-performance.json
- [ ] Testar dashboards no Grafana

### Fase 6: Alertas ⏳ (PENDENTE)
- [ ] Criar prometheus/alerts.yml
- [ ] Atualizar prometheus.yml com rule_files
- [ ] Testar alertas

### Fase 7: Environment ⏳ (PENDENTE)
- [ ] Atualizar .env.example
- [ ] Documentar variáveis

### Fase 8: Documentação ⏳ (PENDENTE)
- [ ] Criar PROMETHEUS_GRAFANA_GUIDE.md
- [ ] Atualizar CLAUDE.md
- [ ] Criar README em grafana/dashboards/

---

## 🔗 REFERÊNCIAS

- **Prometheus Docs**: https://prometheus.io/docs/
- **Grafana Docs**: https://grafana.com/docs/
- **OpenTelemetry Metrics**: https://opentelemetry.io/docs/specs/otel/metrics/
- **PromQL Cheatsheet**: https://promlabs.com/promql-cheat-sheet/

---

**Status**: Fase 1 completa, Fases 2-8 pendentes
**Tempo Estimado Restante**: 4-5 horas
**Prioridade**: Alta (complementa sistema de tracing Jaeger)

---

*Documento criado durante implementação parcial do sistema Prometheus + Grafana*
