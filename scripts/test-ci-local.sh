#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  CI-Identical Local Test Runner${NC}"
echo -e "${YELLOW}========================================${NC}"

# Export test environment variables
export DATABASE_URL="postgresql://postgres@localhost:5433/nuvana_test"
export REDIS_URL="redis://localhost:6380"
export RABBITMQ_URL="amqp://guest:guest@localhost:5673"
export NODE_ENV="test"
export CI="true"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up test containers...${NC}"
    docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
}

# Trap to ensure cleanup runs on script exit
trap cleanup EXIT

echo -e "\n${YELLOW}Step 1: Starting fresh test containers...${NC}"
docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
docker compose -f docker-compose.test.yml up -d

echo -e "\n${YELLOW}Step 2: Waiting for services to be healthy...${NC}"
echo "Waiting for PostgreSQL..."
until docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres 2>/dev/null; do
    sleep 1
done
echo "PostgreSQL is ready!"

echo "Waiting for Redis..."
until docker compose -f docker-compose.test.yml exec -T redis-test redis-cli ping 2>/dev/null | grep -q PONG; do
    sleep 1
done
echo "Redis is ready!"

echo "Waiting for RabbitMQ..."
sleep 5  # RabbitMQ takes longer to initialize
until docker compose -f docker-compose.test.yml exec -T rabbitmq-test rabbitmq-diagnostics -q ping 2>/dev/null; do
    sleep 2
done
echo "RabbitMQ is ready!"

echo -e "\n${YELLOW}Step 3: Running Prisma migrations...${NC}"
cd backend && npx prisma migrate deploy && cd ..

echo -e "\n${YELLOW}Step 4: Seeding RBAC data...${NC}"
npx tsx backend/src/db/seeds/rbac.seed.ts

echo -e "\n${YELLOW}Step 5: Bootstrapping admin user...${NC}"
npx tsx backend/scripts/bootstrap-admin.ts

echo -e "\n${YELLOW}Step 6: Cleaning test data...${NC}"
npx tsx scripts/cleanup-test-data.ts

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Running API Tests (CI Environment)${NC}"
echo -e "${GREEN}========================================${NC}"

# Run the tests - pass any arguments to playwright
npx playwright test --project=api "$@"

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}  ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}  Safe to push to CI${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo -e "\n${RED}========================================${NC}"
    echo -e "${RED}  TESTS FAILED!${NC}"
    echo -e "${RED}  Fix before pushing to CI${NC}"
    echo -e "${RED}========================================${NC}"
fi

exit $TEST_EXIT_CODE
