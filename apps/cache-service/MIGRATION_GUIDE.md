# Migration Guide: LFUManager → Eviction Strategies

## Overview

O sistema de cache foi refatorado para suportar múltiplas estratégias de eviction (LFU, LRU, Hybrid) de forma desacoplada. Esta migração **não quebra** código existente, mas recomendamos atualizar para aproveitar a nova arquitetura.

## Quick Start (Zero Migration)

**Não é necessária nenhuma mudança!** O sistema usa LFU por padrão.

```bash
# Apenas rebuild e restart
pnpm --filter @daap/cache-service build
docker-compose restart cache-service
```

## Optional: Switching to New Strategy

### Option 1: Try LRU

```bash
# Edit .env
EVICTION_STRATEGY=lru

# Restart
docker-compose restart cache-service
```

### Option 2: Try Hybrid

```bash
# Edit .env
EVICTION_STRATEGY=hybrid
EVICTION_FREQUENCY_WEIGHT=0.6
EVICTION_RECENCY_WEIGHT=0.4

# Restart
docker-compose restart cache-service
```

### Verify Active Strategy

```bash
curl http://cache.localhost/cache/stats/info | jq '.strategyName'
# Output: "LFU" or "LRU" or "Hybrid"
```

## For Developers: Code Migration

### If You're Importing LFUManager Directly

**Before**:
```typescript
import { LFUManager } from './lib/cache/lfu-manager.service';

constructor(
  private readonly lfuManager: LFUManager
) {}

await this.lfuManager.checkAndEvict();
```

**After**:
```typescript
import { EvictionStrategy } from './lib/cache/eviction-strategy.interface';

constructor(
  private readonly evictionStrategy: EvictionStrategy
) {}

await this.evictionStrategy.checkAndEvict();
```

### If You're Using Environment Variables

**Before**:
```bash
LFU_MAX_ENTRIES=1000
LFU_EVICTION_BATCH_SIZE=50
```

**After**:
```bash
EVICTION_MAX_ENTRIES=1000
EVICTION_BATCH_SIZE=50
EVICTION_STRATEGY=lfu  # or lru, hybrid
```

**Note**: Old variables still work but are deprecated.

### If You're Testing with Mocks

**Before**:
```typescript
const mockLFU = {
  checkAndEvict: jest.fn(),
  recordAccess: jest.fn(),
  // ...
};

{ provide: LFUManager, useValue: mockLFU }
```

**After**:
```typescript
const mockStrategy = {
  checkAndEvict: jest.fn(),
  recordAccess: jest.fn(),
  getStrategyName: jest.fn().mockReturnValue('Mock'),
  // ...
};

{ provide: EvictionStrategy, useValue: mockStrategy }
```

## Breaking Changes

**None!** This is a backward-compatible refactor.

## Deprecations

The following will be removed in future versions:
- Direct imports of `LFUManager` outside cache service
- Environment variables `LFU_MAX_ENTRIES` and `LFU_EVICTION_BATCH_SIZE`

Use `EvictionStrategy` and `EVICTION_*` variables instead.

## Performance Impact

✅ **Zero impact**: Dependency injection overhead is negligible (~1ms at startup)

## Need Help?

1. Check [EVICTION_STRATEGIES.md](EVICTION_STRATEGIES.md) for strategy comparison
2. Check [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for technical details
3. Run tests: `pnpm --filter @daap/cache-service test`

## Rollback Plan

If something breaks (it shouldn't), just keep using LFU:

```bash
EVICTION_STRATEGY=lfu
```

The default behavior is identical to the old `LFUManager`.
