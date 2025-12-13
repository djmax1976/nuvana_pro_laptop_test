# Comprehensive Railway Setup Script for outstanding-contentment (PowerShell)
# This script analyzes the project and sets up all Railway services automatically

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Railway Comprehensive Setup" -ForegroundColor Cyan
Write-Host "Project: outstanding-contentment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Railway CLI
Write-Host "Step 1: Checking Railway CLI installation..." -ForegroundColor Blue
try {
    $railwayVersion = railway --version 2>&1
    Write-Host "✅ Railway CLI is installed: $railwayVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Railway CLI is not installed" -ForegroundColor Red
    Write-Host "Install it with: npm i -g @railway/cli" -ForegroundColor Yellow
    Write-Host "Or visit: https://docs.railway.app/develop/cli" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 2: Check authentication
Write-Host "Step 2: Checking Railway authentication..." -ForegroundColor Blue
try {
    $whoami = railway whoami 2>&1
    Write-Host "✅ Already logged in:" -ForegroundColor Green
    Write-Host $whoami
} catch {
    Write-Host "⚠️  Not logged in. Please log in:" -ForegroundColor Yellow
    railway login
}
Write-Host ""

# Step 3: Generate secrets
Write-Host "Step 3: Generating secure secrets..." -ForegroundColor Blue
function Generate-Secret {
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

$JWT_SECRET = Generate-Secret
$JWT_REFRESH_SECRET = Generate-Secret
$COOKIE_SECRET = Generate-Secret
Write-Host "✅ Secrets generated" -ForegroundColor Green
Write-Host ""

# Step 4: Create or link project
Write-Host "Step 4: Setting up Railway project..." -ForegroundColor Blue
if (Test-Path ".railway\project.json") {
    Write-Host "✅ Project already linked" -ForegroundColor Green
    $projectJson = Get-Content ".railway\project.json" | ConvertFrom-Json
    $PROJECT_ID = $projectJson.projectId
    Write-Host "Project ID: $PROJECT_ID"
} else {
    Write-Host "Creating new Railway project..."
    railway init --name outstanding-contentment
    $projectJson = Get-Content ".railway\project.json" | ConvertFrom-Json
    $PROJECT_ID = $projectJson.projectId
    Write-Host "✅ Project created: $PROJECT_ID" -ForegroundColor Green
}
Write-Host ""

# Step 5: Create infrastructure services
Write-Host "Step 5: Creating infrastructure services..." -ForegroundColor Blue
Write-Host "Creating PostgreSQL database..."
railway service create --name postgres --type postgresql 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  PostgreSQL service may already exist" -ForegroundColor Yellow
}

Write-Host "Creating Redis service..."
railway service create --name redis --type redis 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Redis service may already exist" -ForegroundColor Yellow
}

Write-Host "Creating RabbitMQ service..."
railway service create --name rabbitmq --type rabbitmq 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  RabbitMQ service may already exist" -ForegroundColor Yellow
}
Write-Host "✅ Infrastructure services created" -ForegroundColor Green
Write-Host ""

# Step 6: Create application services
Write-Host "Step 6: Creating application services..." -ForegroundColor Blue
Write-Host "Creating Backend service..."
railway service create --name backend --source . 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Backend service may already exist" -ForegroundColor Yellow
}

Write-Host "Creating Frontend service..."
railway service create --name frontend --source . 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Frontend service may already exist" -ForegroundColor Yellow
}
Write-Host "✅ Application services created" -ForegroundColor Green
Write-Host ""

# Step 7: Set backend environment variables
Write-Host "Step 7: Configuring Backend environment variables..." -ForegroundColor Blue
railway variables set `
    DATABASE_URL='${{Postgres.DATABASE_URL}}' `
    REDIS_URL='${{Redis.REDIS_URL}}' `
    RABBITMQ_URL='${{RabbitMQ.RABBITMQ_URL}}' `
    JWT_SECRET="$JWT_SECRET" `
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" `
    COOKIE_SECRET="$COOKIE_SECRET" `
    NODE_ENV=production `
    PORT=3001 `
    DAILY_UPLOAD_COUNT=10000 `
    UPLOAD_RATE_LIMIT_MAX=1000 `
    --service backend

Write-Host "✅ Backend environment variables set" -ForegroundColor Green
Write-Host ""

# Step 8: Set frontend environment variables
Write-Host "Step 8: Configuring Frontend environment variables..." -ForegroundColor Blue
$BACKEND_URL = "https://backend-production.up.railway.app"
railway variables set `
    NEXT_PUBLIC_BACKEND_URL="$BACKEND_URL" `
    NODE_ENV=production `
    NEXT_TELEMETRY_DISABLED=1 `
    --service frontend

Write-Host "⚠️  Note: Update NEXT_PUBLIC_BACKEND_URL with actual backend URL after deployment" -ForegroundColor Yellow
Write-Host "✅ Frontend environment variables set" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services created:"
Write-Host "  ✅ PostgreSQL (database)"
Write-Host "  ✅ Redis (cache)"
Write-Host "  ✅ RabbitMQ (queue)"
Write-Host "  ✅ Backend (API)"
Write-Host "  ✅ Frontend (Next.js)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Wait for services to deploy (check Railway dashboard)"
Write-Host "  2. Get your backend URL from Railway dashboard"
Write-Host "  3. Update frontend NEXT_PUBLIC_BACKEND_URL:"
Write-Host "     railway variables set NEXT_PUBLIC_BACKEND_URL=<your-backend-url> --service frontend"
Write-Host "  4. Verify deployments in Railway dashboard"
Write-Host ""
Write-Host "Generated secrets (save these securely):"
Write-Host "  JWT_SECRET: $JWT_SECRET"
Write-Host "  JWT_REFRESH_SECRET: $JWT_REFRESH_SECRET"
Write-Host "  COOKIE_SECRET: $COOKIE_SECRET"
Write-Host ""
Write-Host "View your project:"
Write-Host "  railway dashboard"
Write-Host ""
