#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Default values
TEST_SCRIPT="cache-load-test.js"
BASE_URL="http://reviews-service:3001"
CACHE_URL="http://cache-service:3002"
EVICTION_STRATEGY="lfu"
OUTPUT_DIR="packages/tools/k6/results"
K6_IMAGE="grafana/k6:0.49.0"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --script)
      TEST_SCRIPT="$2"
      shift 2
      ;;
    --strategy)
      EVICTION_STRATEGY="$2"
      shift 2
      ;;
    --url)
      BASE_URL="$2"
      shift 2
      ;;
    --help)
      echo -e "${BOLD}${BLUE}k6 Load Testing - DAAP Cache System${NC}"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --script SCRIPT      Test script to run (default: cache-load-test.js)"
      echo "  --strategy STRATEGY  Eviction strategy: lfu|lru|hybrid (default: lfu)"
      echo "  --url URL            Base URL (default: http://reviews-service:3001)"
      echo "  --help               Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0"
      echo "  $0 --script cache-stress-test.js"
      echo "  $0 --strategy lru"
      echo "  $0 --script strategy-comparison-test.js --strategy hybrid"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Clear screen and show header
clear
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║          k6 Load Testing - DAAP Cache System              ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}${BOLD}Configuration${NC}"
echo -e "${DIM}────────────────────────────────────────────────────────────${NC}"
echo -e "  ${BOLD}Script:${NC}    ${YELLOW}${TEST_SCRIPT}${NC}"
echo -e "  ${BOLD}Strategy:${NC}  ${YELLOW}${EVICTION_STRATEGY}${NC}"
echo -e "  ${BOLD}Base URL:${NC}  ${DIM}${BASE_URL}${NC}"
echo -e "  ${BOLD}Cache URL:${NC} ${DIM}${CACHE_URL}${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}${BOLD}✗${NC} Docker is not running"
  exit 1
fi

# Ensure infrastructure is up
echo -e "${CYAN}${BOLD}Infrastructure Health Check${NC}"
echo -e "${DIM}────────────────────────────────────────────────────────────${NC}"

if ! docker ps | grep -q daap-reviews-service; then
  echo -e "${RED}${BOLD}✗${NC} Reviews service is not running"
  echo -e "${YELLOW}  → Start infrastructure: ${BOLD}docker-compose up -d${NC}"
  exit 1
fi
echo -e "${GREEN}${BOLD}✓${NC} Reviews service is running"

if ! docker ps | grep -q daap-cache-service; then
  echo -e "${RED}${BOLD}✗${NC} Cache service is not running"
  echo -e "${YELLOW}  → Start infrastructure: ${BOLD}docker-compose up -d${NC}"
  exit 1
fi
echo -e "${GREEN}${BOLD}✓${NC} Cache service is running"

if ! docker ps | grep -q daap-influxdb; then
  echo -e "${YELLOW}${BOLD}⚠${NC} InfluxDB is not running. Starting..."
  docker-compose up -d influxdb
  echo -e "${CYAN}  → Waiting for InfluxDB to be ready...${NC}"
  sleep 10
fi
echo -e "${GREEN}${BOLD}✓${NC} InfluxDB is running"

echo ""

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Pull k6 image if not present
if ! docker image inspect "${K6_IMAGE}" > /dev/null 2>&1; then
  echo -e "${YELLOW}Pulling k6 image...${NC}"
  docker pull "${K6_IMAGE}"
  echo ""
fi

# Show test stages (parse from script)
echo -e "${CYAN}${BOLD}Test Execution${NC}"
echo -e "${DIM}────────────────────────────────────────────────────────────${NC}"

# Determine test type and duration
case "${TEST_SCRIPT}" in
  *stress*)
    echo -e "  ${BOLD}Test Type:${NC}     ${MAGENTA}Stress Test${NC} (High Load)"
    echo -e "  ${BOLD}Duration:${NC}      ~12 minutes"
    echo -e "  ${BOLD}Goal:${NC}          Trigger cache eviction"
    ;;
  *strategy-comparison*)
    echo -e "  ${BOLD}Test Type:${NC}     ${MAGENTA}Strategy Comparison${NC}"
    echo -e "  ${BOLD}Duration:${NC}      ~7 minutes"
    echo -e "  ${BOLD}Goal:${NC}          Compare eviction strategies"
    ;;
  *)
    echo -e "  ${BOLD}Test Type:${NC}     ${MAGENTA}Cache Load Test${NC}"
    echo -e "  ${BOLD}Duration:${NC}      ~15 minutes"
    echo -e "  ${BOLD}Stages:${NC}        Warmup → Ramp-up → Peak → Stress → Recovery"
    ;;
esac

echo ""
echo -e "${DIM}Starting test execution...${NC}"
echo -e "${DIM}────────────────────────────────────────────────────────────${NC}"
echo ""

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# Run k6 test with quiet mode and custom summary
docker run --rm \
  --network daap_app_network \
  -v "$(pwd)/packages/tools/k6:/scripts" \
  -e K6_OUT="influxdb=http://influxdb:8086" \
  -e K6_INFLUXDB_DB="k6" \
  -e K6_INFLUXDB_INSECURE="true" \
  -e BASE_URL="${BASE_URL}" \
  -e CACHE_URL="${CACHE_URL}" \
  -e EVICTION_STRATEGY="${EVICTION_STRATEGY}" \
  -e NODE_ENV="testing" \
  "${K6_IMAGE}" run \
  --summary-trend-stats="min,avg,med,max,p(90),p(95),p(99)" \
  --summary-time-unit=ms \
  "/scripts/scripts/${TEST_SCRIPT}"

# Test completion
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}║              ✓ Test Completed Successfully!               ║${NC}"
  echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
else
  echo -e "${RED}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}${BOLD}║              ✗ Test Failed (Exit Code: ${EXIT_CODE})                ║${NC}"
  echo -e "${RED}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo -e "${CYAN}${BOLD}Next Steps${NC}"
echo -e "${DIM}────────────────────────────────────────────────────────────${NC}"
echo -e "${BOLD}📊 View Results:${NC}"
echo -e "   ${DIM}→${NC} Summary JSON:  ${OUTPUT_DIR}/summary-${EVICTION_STRATEGY}-*.json"
echo -e "   ${DIM}→${NC} HTML Report:   ${OUTPUT_DIR}/summary-${EVICTION_STRATEGY}-*.html"
echo ""
echo -e "${BOLD}📈 View Live Dashboards:${NC}"
echo -e "   ${DIM}→${NC} Grafana:  ${CYAN}http://localhost:3000${NC} ${DIM}(admin/admin)${NC}"
echo -e "   ${DIM}→${NC} InfluxDB: ${CYAN}http://localhost:8086${NC} ${DIM}(admin/adminadmin)${NC}"
echo -e "   ${DIM}→${NC} Jaeger:   ${CYAN}http://localhost:16686${NC}"
echo ""
echo -e "${DIM}💡 Tip: View k6 metrics in Grafana using the 'InfluxDB (k6)' data source${NC}"
echo ""

exit $EXIT_CODE
