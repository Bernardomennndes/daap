#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

STRATEGIES=("lfu" "lru" "hybrid")
RESULTS_DIR="packages/tools/k6/results"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   k6 Strategy Comparison Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${CYAN}Testing strategies:${NC} ${YELLOW}LFU, LRU, Hybrid${NC}"
echo -e "${CYAN}Estimated time:${NC} ${YELLOW}~21 minutes (7 min per strategy)${NC}"
echo ""
echo -e "${YELLOW}⚠️  Note: Cache service will be restarted between tests${NC}"
echo ""

# Prompt for confirmation
read -p "$(echo -e ${CYAN}'Continue? (y/n): '${NC})" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Test cancelled${NC}"
  exit 0
fi

echo ""
mkdir -p "${RESULTS_DIR}"

# Backup current .env
if [ -f .env ]; then
  cp .env .env.backup.k6
  echo -e "${GREEN}✅ Backed up .env to .env.backup.k6${NC}"
fi

COMPARISON_RESULTS="${RESULTS_DIR}/comparison-results-${TIMESTAMP}.txt"
echo "k6 Strategy Comparison Test Results" > "${COMPARISON_RESULTS}"
echo "Date: $(date)" >> "${COMPARISON_RESULTS}"
echo "======================================" >> "${COMPARISON_RESULTS}"
echo "" >> "${COMPARISON_RESULTS}"

for strategy in "${STRATEGIES[@]}"; do
  echo ""
  echo -e "${MAGENTA}=========================================${NC}"
  echo -e "${MAGENTA}   Testing Strategy: ${strategy^^}${NC}"
  echo -e "${MAGENTA}=========================================${NC}"
  echo ""

  # Update .env with current strategy
  if [ -f .env ]; then
    # Update existing EVICTION_STRATEGY or add it
    if grep -q "^EVICTION_STRATEGY=" .env; then
      sed -i.bak "s/^EVICTION_STRATEGY=.*/EVICTION_STRATEGY=${strategy}/" .env
    else
      echo "EVICTION_STRATEGY=${strategy}" >> .env
    fi
  else
    echo "EVICTION_STRATEGY=${strategy}" > .env
  fi

  echo -e "${YELLOW}🔧 Updated EVICTION_STRATEGY=${strategy}${NC}"

  # Restart cache-service with new strategy
  echo -e "${YELLOW}🔄 Restarting cache-service...${NC}"
  docker-compose stop cache-service
  docker-compose up -d cache-service

  # Wait for service to be healthy
  echo -e "${YELLOW}⏳ Waiting for cache-service to be ready...${NC}"
  sleep 15

  # Verify service is responding
  MAX_RETRIES=5
  RETRY=0
  while [ $RETRY -lt $MAX_RETRIES ]; do
    if docker exec daap-cache-service wget -q -O- http://localhost:3002/health > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Cache service is healthy${NC}"
      break
    fi
    RETRY=$((RETRY+1))
    echo -e "${YELLOW}⏳ Retry $RETRY/$MAX_RETRIES...${NC}"
    sleep 5
  done

  if [ $RETRY -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ Cache service failed to start${NC}"
    continue
  fi

  echo ""

  # Run k6 test for this strategy
  echo -e "${CYAN}🚀 Running k6 test for ${strategy^^}...${NC}"
  echo ""

  bash scripts/run-k6-test.sh \
    --script strategy-comparison-test.js \
    --strategy "${strategy}"

  TEST_EXIT_CODE=$?

  if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ ${strategy^^} test completed${NC}"
    echo "Strategy: ${strategy^^} - COMPLETED" >> "${COMPARISON_RESULTS}"
  else
    echo -e "${RED}❌ ${strategy^^} test failed${NC}"
    echo "Strategy: ${strategy^^} - FAILED" >> "${COMPARISON_RESULTS}"
  fi

  echo "" >> "${COMPARISON_RESULTS}"

  # Wait before next test
  if [ "$strategy" != "hybrid" ]; then
    echo -e "${YELLOW}⏸️  Waiting 10 seconds before next test...${NC}"
    sleep 10
  fi
done

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   ✅ All Strategy Tests Completed!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

# Restore .env
if [ -f .env.backup.k6 ]; then
  mv .env.backup.k6 .env
  echo -e "${GREEN}✅ Restored original .env${NC}"
  echo ""
fi

# Restart cache-service with original config
echo -e "${YELLOW}🔄 Restarting cache-service with original config...${NC}"
docker-compose restart cache-service
sleep 5

echo ""
echo -e "${BLUE}📊 Results Summary:${NC}"
cat "${COMPARISON_RESULTS}"
echo ""
echo -e "${BLUE}📁 Detailed results:${NC} ${RESULTS_DIR}/"
echo -e "${BLUE}📄 Summary file:${NC} ${COMPARISON_RESULTS}"
echo ""
echo -e "${BLUE}📈 View Comparison in Grafana:${NC}"
echo -e "  ${CYAN}1.${NC} Open http://localhost:3000"
echo -e "  ${CYAN}2.${NC} Select 'InfluxDB (k6)' data source"
echo -e "  ${CYAN}3.${NC} Filter by tag: ${YELLOW}eviction_strategy${NC}"
echo -e "  ${CYAN}4.${NC} Compare metrics across ${YELLOW}lfu, lru, hybrid${NC}"
echo ""
echo -e "${YELLOW}💡 Tip:${NC} Use Grafana's 'Compare' feature to overlay all three strategies"
echo ""
