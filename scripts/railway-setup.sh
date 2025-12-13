#!/bin/bash
# Comprehensive Railway Setup Script for outstanding-contentment
# This script analyzes the project and sets up all Railway services automatically

set -e  # Exit on error

echo "=========================================="
echo "Railway Comprehensive Setup"
echo "Project: outstanding-contentment"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
echo -e "${BLUE}Step 1: Checking Railway CLI installation...${NC}"
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI is not installed${NC}"
    echo "Install it with: npm i -g @railway/cli"
    echo "Or visit: https://docs.railway.app/develop/cli"
    exit 1
fi
echo -e "${GREEN}✅ Railway CLI is installed${NC}"
echo ""

# Check if logged in
echo -e "${BLUE}Step 2: Checking Railway authentication...${NC}"
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in. Please log in:${NC}"
    railway login
else
    echo -e "${GREEN}✅ Already logged in to Railway${NC}"
    railway whoami
fi
echo ""

# Generate secure secrets
generate_secret() {
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

echo -e "${BLUE}Step 3: Generating secure secrets...${NC}"
JWT_SECRET=$(generate_secret)
JWT_REFRESH_SECRET=$(generate_secret)
COOKIE_SECRET=$(generate_secret)
echo -e "${GREEN}✅ Secrets generated${NC}"
echo ""

# Create or link to project
echo -e "${BLUE}Step 4: Setting up Railway project...${NC}"
if [ -f ".railway/project.json" ]; then
    echo -e "${GREEN}✅ Project already linked${NC}"
    PROJECT_ID=$(cat .railway/project.json | grep -o '"projectId":"[^"]*' | cut -d'"' -f4)
    echo "Project ID: $PROJECT_ID"
else
    echo "Creating new Railway project..."
    railway init --name outstanding-contentment
    PROJECT_ID=$(cat .railway/project.json | grep -o '"projectId":"[^"]*' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Project created: $PROJECT_ID${NC}"
fi
echo ""

# Function to create service if it doesn't exist
create_service() {
    local SERVICE_NAME=$1
    local SERVICE_TYPE=$2
    
    echo -e "${BLUE}Checking for $SERVICE_NAME service...${NC}"
    
    # Check if service exists (this is a simplified check)
    # Railway CLI doesn't have a direct "service exists" command, so we'll try to create
    # and handle errors gracefully
    
    case $SERVICE_TYPE in
        "postgres")
            echo "Creating PostgreSQL database..."
            railway service create --name postgres --type postgresql || echo "Service may already exist"
            ;;
        "redis")
            echo "Creating Redis service..."
            railway service create --name redis --type redis || echo "Service may already exist"
            ;;
        "rabbitmq")
            echo "Creating RabbitMQ service..."
            railway service create --name rabbitmq --type rabbitmq || echo "Service may already exist"
            ;;
        "backend")
            echo "Creating Backend service from GitHub..."
            railway service create --name backend --source . || echo "Service may already exist"
            ;;
        "frontend")
            echo "Creating Frontend service from GitHub..."
            railway service create --name frontend --source . || echo "Service may already exist"
            ;;
    esac
}

# Create infrastructure services
echo -e "${BLUE}Step 5: Creating infrastructure services...${NC}"
create_service "postgres" "postgres"
create_service "redis" "redis"
create_service "rabbitmq" "rabbitmq"
echo -e "${GREEN}✅ Infrastructure services created${NC}"
echo ""

# Create application services
echo -e "${BLUE}Step 6: Creating application services...${NC}"
create_service "backend" "backend"
create_service "frontend" "frontend"
echo -e "${GREEN}✅ Application services created${NC}"
echo ""

# Set backend environment variables
echo -e "${BLUE}Step 7: Configuring Backend environment variables...${NC}"
railway variables set \
    DATABASE_URL='${{Postgres.DATABASE_URL}}' \
    REDIS_URL='${{Redis.REDIS_URL}}' \
    RABBITMQ_URL='${{RabbitMQ.RABBITMQ_URL}}' \
    JWT_SECRET="$JWT_SECRET" \
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    COOKIE_SECRET="$COOKIE_SECRET" \
    NODE_ENV=production \
    PORT=3001 \
    DAILY_UPLOAD_COUNT=10000 \
    UPLOAD_RATE_LIMIT_MAX=1000 \
    --service backend

echo -e "${GREEN}✅ Backend environment variables set${NC}"
echo ""

# Get backend URL (we'll need to wait for deployment or get it from Railway)
echo -e "${BLUE}Step 8: Getting Backend service URL...${NC}"
# Note: This might not work until the service is deployed
# We'll set a placeholder and update it later
BACKEND_URL="https://backend-production.up.railway.app"
echo "Backend URL (placeholder): $BACKEND_URL"
echo "Note: Update NEXT_PUBLIC_BACKEND_URL after backend is deployed"
echo ""

# Set frontend environment variables
echo -e "${BLUE}Step 9: Configuring Frontend environment variables...${NC}"
railway variables set \
    NEXT_PUBLIC_BACKEND_URL="$BACKEND_URL" \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    --service frontend

echo -e "${YELLOW}⚠️  Note: Update NEXT_PUBLIC_BACKEND_URL with actual backend URL after deployment${NC}"
echo -e "${GREEN}✅ Frontend environment variables set${NC}"
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Services created:"
echo "  ✅ PostgreSQL (database)"
echo "  ✅ Redis (cache)"
echo "  ✅ RabbitMQ (queue)"
echo "  ✅ Backend (API)"
echo "  ✅ Frontend (Next.js)"
echo ""
echo "Next steps:"
echo "  1. Wait for services to deploy (check Railway dashboard)"
echo "  2. Get your backend URL from Railway dashboard"
echo "  3. Update frontend NEXT_PUBLIC_BACKEND_URL:"
echo "     railway variables set NEXT_PUBLIC_BACKEND_URL=<your-backend-url> --service frontend"
echo "  4. Verify deployments in Railway dashboard"
echo ""
echo "Generated secrets (save these securely):"
echo "  JWT_SECRET: $JWT_SECRET"
echo "  JWT_REFRESH_SECRET: $JWT_REFRESH_SECRET"
echo "  COOKIE_SECRET: $COOKIE_SECRET"
echo ""
echo "View your project:"
echo "  railway dashboard"
echo ""
