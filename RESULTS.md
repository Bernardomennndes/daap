# Resultados e Especificações da Avaliação do Serviço de Cache

## Especificações do Ambiente de Teste

- **Serviço de Cache:** Cache Service com implementação LFU
- **Sistemas de Cache Testados:** Redis e Dragonfly
- **Número de Consultas Testadas:** 1.000, 10.000 e 100.000
- **Ferramenta de Teste:** cURL para simulação de requisições HTTP
- **Métricas Coletadas:** Tempo de resposta com e sem cache, taxa de acerto do cache
- **Ambiente de Teste:** Docker com contêineres para cada sistema de cache
- **Especificações do Hardware:** Chip M2 Air (8 cores), 8GB RAM, 1GB Swap

## Cenários

- Cenário 1: Requisição de múltiplos clientes com buscas pelas descrições e palavras-chaves de reviews sem a implementação de cache
- Cenário 2: Requisição de múltiplos clientes com buscas pelas descrições e palavras-chaves de reviews com a implementação de cache com Redis
- Cenário 3: Requisição de múltiplos clientes com buscas pelas descrições e palavras-chaves de reviews com a implementação de cache com Dragonfly

## Limitações

(A ser preenchido)

## Resultados Coletados

## Utilização de recursos alocados

- CPU: média de 6-12% de uso durante os testes com cache ativo, e média de 95% sem cache - já que o banco de dados precisa processar todas as consultas. Ambas com 5 conexões paralelas.

### Tempo de Resposta

| Nº Consultas | Nº C. Paralelas | Sistema   | Tempo médio c/ Cache (ms) | Tempo médio s/ Cache (ms) | Diferença (%) |
| ------------ | --------------- | --------- | ------------------------- | ------------------------- | -------------- |
| 1.000        | 5               | Redis     | 8                         | 7580                      | 99.89          |
| 1.000        | 5               | Dragonfly | 9                         | 7691                      | 99.88          |
| 10.000       | 5               | Redis     | 8                         | 9656                      | 99.92          |
| 10.000       | 5               | Dragonfly | 9                         | 9681                      | 99.91          |
| 100.000      | 5               | Redis     | 8                         | 6988                      | 99.87          |
| 100.000      | 5               | Dragonfly | 8                         | 6701                      | 99.88          |

### Taxa de Acerto do Cache (100.000 consultas)

| Palavra-chave | Contagem | Percentagem | Tempo Médio de Resposta (ms) | Total de Consultas | Taxa de Acerto do Cache (%) |
| ------------- | -------- | ----------- | ---------------------------- | ------------------ | --------------------------- |
| product       | 3235     | 1.23        | 4223.75                      | 1086               | 98.97                       |
| screen        | 3151     | 1.20        | 4749.81                      | 1359               | 76.38                       |
| camera        | 2883     | 1.10        | 4587.83                      | 1184               | 84.46                       |
| tv            | 2390     | 0.91        | 4474.72                      | 951                | 90.43                       |
| protector     | 2386     | 0.91        | 4602.46                      | 963                | 87.02                       |
| monitor       | 2374     | 0.90        | 4407.81                      | 945                | 93.02                       |
| item          | 2369     | 0.90        | 4533.57                      | 914                | 91.36                       |
| laptop        | 2356     | 0.90        | 4479.48                      | 918                | 93.03                       |
| case          | 2340     | 0.89        | 4520.32                      | 918                | 91.18                       |
| smartphone    | 2325     | 0.88        | 4488.49                      | 932                | 90.34                       |
| device        | 2294     | 0.87        | 4526.36                      | 913                | 87.84                       |
| headphones    | 2274     | 0.86        | 4599.14                      | 922                | 85.14                       |
| mouse         | 2272     | 0.86        | 4437.22                      | 885                | 95.37                       |
| tablet        | 2267     | 0.86        | 4452.57                      | 885                | 93.45                       |
| phone         | 2265     | 0.86        | 4434.19                      | 896                | 92.86                       |

## Cálculo de Score

O cálculo de score é usado para determinar quais itens devem ser **removidos (evicted)** do cache quando ele atinge sua capacidade máxima. Trata-se de uma implementação **LFU (Least Frequently Used) com consideração de tempo**.

## Fórmula

```javascript
const timeSinceAccess = now - lastAccess;
const ageInHours = timeSinceAccess / 3600;

const score = 1 / (freq + 1) + age * 0.1;
```

## Componentes

1. **`1/(freq+1)`** - Componente de frequência

   - Quanto **maior** a frequência de acesso (`freq`), **menor** será este valor
   - O `+1` evita divisão por zero para itens nunca acessados
   - Itens muito acessados terão score baixo

2. **`age * 0.1`** - Componente de envelhecimento
   - `age` é calculado em horas desde o último acesso
   - Quanto **mais tempo** sem ser acessado, **maior** o score
   - O fator `0.1` dá um peso menor ao tempo comparado à frequência

## Estratégia de Eviction

- **Score ALTO** (⬆️) → Item é **REMOVIDO** primeiro
  - Pouco acessado + antigo
- **Score BAIXO** (⬇️) → Item **PERMANECE** no cache
  - Muito acessado + recente

## Exemplos Práticos

**Exemplo 1 - Será REMOVIDO ❌**

- `freq=1` (acessado apenas 2 vezes)
- `age=24h` (não acessado há 24 horas)
- `score = 1/(1+1) + (24 * 0.1) = 0.5 + 2.4 = 2.9`
- Score alto → Candidato à remoção

**Exemplo 2 - PERMANECE no cache ✅**

- `freq=10` (acessado 11 vezes)
- `age=1h` (acessado há 1 hora)
- `score = 1/(10+1) + (1 * 0.1) = 0.09 + 0.1 = 0.19`
- Score baixo → Mantido no cache

Esta abordagem híbrida combina o melhor de **LFU** (prioriza itens frequentes) com **LRU** (considera recência), evitando que itens antigos mas populares sejam removidos prematuramente.

## Análise dos Resultados

(A ser preenchido)
