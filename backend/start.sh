#!/bin/sh
# Railway startup script - runs migrations, seeds RBAC, bootstraps admin, then starts the server
# Enterprise-grade with exponential backoff and retry logic

echo "=========================================="
echo "Railway Backend Startup Script"
echo "=========================================="

# ===========================================
# Database Health Check with Exponential Backoff
# ===========================================
wait_for_database() {
  MAX_RETRIES=10
  RETRY_COUNT=0
  WAIT_TIME=2

  echo "Checking database connectivity..."
  echo "DATABASE_URL: ${DATABASE_URL:0:50}..." # Print first 50 chars for debugging

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Use npx prisma migrate status as a connectivity check (more reliable than db execute)
    # It will fail fast if DB is unreachable
    npx prisma migrate status > /dev/null 2>&1
    RESULT=$?

    if [ $RESULT -eq 0 ]; then
      echo "✅ Database is reachable"
      return 0
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "⏳ Database not ready (attempt $RETRY_COUNT/$MAX_RETRIES, exit code: $RESULT). Waiting ${WAIT_TIME}s..."
    sleep $WAIT_TIME

    # Exponential backoff: 2, 4, 8, 16, 32, 60, 60, 60...
    if [ $WAIT_TIME -lt 60 ]; then
      WAIT_TIME=$((WAIT_TIME * 2))
    fi
  done

  # Final attempt with verbose output for debugging
  echo "Final connection attempt with verbose output:"
  npx prisma migrate status 2>&1

  echo "❌ Database not reachable after $MAX_RETRIES attempts"
  return 1
}

# ===========================================
# Migration with Retry Logic
# ===========================================
run_migrations_with_retry() {
  MAX_RETRIES=3
  RETRY_COUNT=0

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Running migrations (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)..."
    npx prisma migrate deploy

    if [ $? -eq 0 ]; then
      return 0
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "⚠️  Migration failed, retrying in 5s..."
      sleep 5
    fi
  done

  return 1
}

# Step 1: Wait for database to be ready
echo ""
echo "Step 1: Waiting for database..."
wait_for_database
if [ $? -ne 0 ]; then
  echo "❌ Could not connect to database after multiple retries!"
  exit 1
fi

# Step 2: Run database migrations
echo ""
echo "Step 2: Running database migrations..."
run_migrations_with_retry
if [ $? -ne 0 ]; then
  echo "❌ Database migrations failed after all retries!"
  exit 1
fi
echo "✅ Database migrations completed"

# Step 3: Seed RBAC roles and permissions
echo ""
echo "Step 3: Seeding RBAC roles and permissions..."
npx tsx src/db/seeds/rbac.seed.ts
if [ $? -ne 0 ]; then
  echo "⚠️  RBAC seed failed, but continuing..."
fi

# Step 4: Bootstrap super admin user
echo ""
echo "Step 4: Bootstrapping super admin user..."
npx tsx scripts/bootstrap-admin.ts
if [ $? -ne 0 ]; then
  echo "⚠️  Admin bootstrap failed, but continuing..."
fi

# Step 5: Start the server
echo ""
echo "Step 5: Starting backend server..."
echo "=========================================="
node dist/app.js

