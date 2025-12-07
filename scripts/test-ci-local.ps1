# CI-Identical Local Test Runner for Windows
param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$TestArgs
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  CI-Identical Local Test Runner" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# Export test environment variables
$env:DATABASE_URL = "postgresql://postgres@localhost:5433/nuvana_test"
$env:REDIS_URL = "redis://localhost:6380"
$env:RABBITMQ_URL = "amqp://guest:guest@localhost:5673"
$env:NODE_ENV = "test"
$env:CI = "true"

function Cleanup {
    Write-Host "`nCleaning up test containers..." -ForegroundColor Yellow
    docker compose -f docker-compose.test.yml down -v 2>$null
}

# Register cleanup on script exit
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null

try {
    Write-Host "`nStep 1: Starting fresh test containers..." -ForegroundColor Yellow
    docker compose -f docker-compose.test.yml down -v 2>$null
    docker compose -f docker-compose.test.yml up -d

    Write-Host "`nStep 2: Waiting for services to be healthy..." -ForegroundColor Yellow

    Write-Host "Waiting for PostgreSQL..."
    $maxRetries = 30
    $retries = 0
    do {
        Start-Sleep -Seconds 1
        $result = docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres 2>$null
        $retries++
    } while ($LASTEXITCODE -ne 0 -and $retries -lt $maxRetries)

    if ($retries -ge $maxRetries) {
        throw "PostgreSQL failed to start"
    }
    Write-Host "PostgreSQL is ready!" -ForegroundColor Green

    Write-Host "Waiting for Redis..."
    $retries = 0
    do {
        Start-Sleep -Seconds 1
        $result = docker compose -f docker-compose.test.yml exec -T redis-test redis-cli ping 2>$null
        $retries++
    } while ($result -ne "PONG" -and $retries -lt $maxRetries)

    if ($retries -ge $maxRetries) {
        throw "Redis failed to start"
    }
    Write-Host "Redis is ready!" -ForegroundColor Green

    Write-Host "Waiting for RabbitMQ..."
    Start-Sleep -Seconds 5  # RabbitMQ takes longer
    $retries = 0
    do {
        Start-Sleep -Seconds 2
        docker compose -f docker-compose.test.yml exec -T rabbitmq-test rabbitmq-diagnostics -q ping 2>$null
        $retries++
    } while ($LASTEXITCODE -ne 0 -and $retries -lt $maxRetries)

    if ($retries -ge $maxRetries) {
        throw "RabbitMQ failed to start"
    }
    Write-Host "RabbitMQ is ready!" -ForegroundColor Green

    Write-Host "`nStep 3: Running Prisma migrations..." -ForegroundColor Yellow
    Push-Location backend
    npx prisma migrate deploy
    Pop-Location

    Write-Host "`nStep 4: Seeding RBAC data..." -ForegroundColor Yellow
    npx tsx backend/src/db/seeds/rbac.seed.ts

    Write-Host "`nStep 5: Bootstrapping admin user..." -ForegroundColor Yellow
    npx tsx backend/scripts/bootstrap-admin.ts

    Write-Host "`nStep 6: Cleaning test data..." -ForegroundColor Yellow
    npx tsx scripts/cleanup-test-data.ts

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  Running API Tests (CI Environment)" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green

    # Run the tests
    if ($TestArgs) {
        npx playwright test --project=api @TestArgs
    } else {
        npx playwright test --project=api
    }

    $testExitCode = $LASTEXITCODE

    if ($testExitCode -eq 0) {
        Write-Host "`n========================================" -ForegroundColor Green
        Write-Host "  ALL TESTS PASSED!" -ForegroundColor Green
        Write-Host "  Safe to push to CI" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
    } else {
        Write-Host "`n========================================" -ForegroundColor Red
        Write-Host "  TESTS FAILED!" -ForegroundColor Red
        Write-Host "  Fix before pushing to CI" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
    }

    exit $testExitCode
}
finally {
    Cleanup
}
