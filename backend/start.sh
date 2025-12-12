#!/bin/sh
# Railway startup script - runs migrations, seeds RBAC, bootstraps admin, then starts the server

echo "=========================================="
echo "Railway Backend Startup Script"
echo "=========================================="

# Step 1: Run database migrations
echo ""
echo "Step 1: Running database migrations..."
npx prisma migrate deploy
if [ $? -ne 0 ]; then
  echo "❌ Database migrations failed!"
  exit 1
fi
echo "✅ Database migrations completed"

# Step 2: Seed RBAC roles and permissions
echo ""
echo "Step 2: Seeding RBAC roles and permissions..."
npx tsx src/db/seeds/rbac.seed.ts
if [ $? -ne 0 ]; then
  echo "⚠️  RBAC seed failed, but continuing..."
fi

# Step 3: Bootstrap super admin user
echo ""
echo "Step 3: Bootstrapping super admin user..."
npx tsx scripts/bootstrap-admin.ts
if [ $? -ne 0 ]; then
  echo "⚠️  Admin bootstrap failed, but continuing..."
fi

# Step 4: Start the server
echo ""
echo "Step 4: Starting backend server..."
echo "=========================================="
node dist/app.js

