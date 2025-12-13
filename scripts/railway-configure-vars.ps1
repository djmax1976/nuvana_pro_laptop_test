# Railway Environment Variables Configuration Script
# Run this AFTER creating all services via Railway Dashboard

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Railway Environment Variables Setup" -ForegroundColor Cyan
Write-Host "Project: outstanding-contentment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Generated secrets (from initial setup)
$JWT_SECRET = "822e896b8f5c438dfc26f5639c4a836845b2e29081e17762f5ea4fa745845af0"
$JWT_REFRESH_SECRET = "39001d7bf56e8a566af1c6226d369855cce13352fb9ec17391696ee7b2c5be61"
$COOKIE_SECRET = "757c9a3913b1a721db5be967866c79d2d3b6f3317010651973383870be7cc149"

Write-Host "Step 1: Configuring Backend Service Variables..." -ForegroundColor Blue

# Switch to backend service
railway service backend

# Set backend environment variables
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}'
railway variables set REDIS_URL='${{Redis.REDIS_URL}}'
railway variables set RABBITMQ_URL='${{RabbitMQ.RABBITMQ_URL}}'
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
railway variables set COOKIE_SECRET="$COOKIE_SECRET"
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set DAILY_UPLOAD_COUNT=10000
railway variables set UPLOAD_RATE_LIMIT_MAX=1000

Write-Host "✅ Backend variables configured" -ForegroundColor Green
Write-Host ""

Write-Host "Step 2: Configuring Frontend Service Variables..." -ForegroundColor Blue

# Switch to frontend service
railway service frontend

# Get backend URL (user needs to provide this after backend deploys)
Write-Host "⚠️  Please provide your backend service URL:" -ForegroundColor Yellow
Write-Host "   (Get it from Railway dashboard after backend deploys)" -ForegroundColor Yellow
$backendUrl = Read-Host "Enter backend URL (or press Enter to use placeholder)"

if ([string]::IsNullOrWhiteSpace($backendUrl)) {
    $backendUrl = "https://backend-production.up.railway.app"
    Write-Host "Using placeholder URL. Update this after backend deploys!" -ForegroundColor Yellow
}

railway variables set NEXT_PUBLIC_BACKEND_URL="$backendUrl"
railway variables set NODE_ENV=production
railway variables set NEXT_TELEMETRY_DISABLED=1

Write-Host "✅ Frontend variables configured" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Wait for services to deploy"
Write-Host "  2. Get actual backend URL from Railway dashboard"
Write-Host "  3. Update frontend NEXT_PUBLIC_BACKEND_URL if needed:"
Write-Host "     railway service frontend"
Write-Host "     railway variables set NEXT_PUBLIC_BACKEND_URL='<actual-url>'"
Write-Host ""
Write-Host "View project: https://railway.com/project/ef54c8e0-0edf-4782-a583-4f7f0022c507" -ForegroundColor Cyan
Write-Host ""
