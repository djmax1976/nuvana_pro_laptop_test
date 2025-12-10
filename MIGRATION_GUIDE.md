# Database Migration Guide: Local Docker → AWS RDS

This guide explains how to migrate your database from local Docker to AWS RDS production.

## Overview

The migration process has 3 steps:
1. **Export** data from local Docker database
2. **Create schema** on AWS RDS (run migrations)
3. **Import** data into AWS RDS

## Prerequisites

- Local Docker database is running and has data
- AWS RDS instance is created and accessible
- You have AWS credentials configured
- You have the database connection string for AWS RDS

## Step 1: Export Data from Local Database

From your local machine, export all data from the Docker database:

```bash
# Make sure your local database is running
# Set DATABASE_URL to your local Docker database
cd backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_dev node scripts/export-db.js
```

This creates `backend/db-backup.json` with all your data.

**Verify the backup:**
```bash
# Check the backup file was created
ls -lh backend/db-backup.json

# Check the file size (should be > 0)
# On Windows PowerShell:
Get-Item backend/db-backup.json | Select-Object Length
```

## Step 2: Create Schema on AWS RDS

The deployment workflow will automatically run migrations when you deploy. However, if you need to run them manually:

### Option A: Via Deployment Workflow (Recommended)

The deployment workflow (`.github/workflows/deploy.yml`) now includes:
- Running Prisma migrations (`prisma migrate deploy`)
- Seeding RBAC roles and permissions

Just push to `main` branch and the workflow will handle it.

### Option B: Manual Migration

If you need to run migrations manually:

```bash
# Get AWS RDS database URL from Secrets Manager
DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id /nuvana-prod/database/url \
  --query 'SecretString' \
  --output text)

# Run migrations
cd backend
DATABASE_URL=$DATABASE_URL npx prisma migrate deploy

# Seed RBAC roles and permissions
DATABASE_URL=$DATABASE_URL npx tsx src/db/seeds/rbac.seed.ts
```

**On Windows PowerShell:**
```powershell
# Get database URL
$dbUrl = aws secretsmanager get-secret-value --secret-id /nuvana-prod/database/url --query 'SecretString' --output text

# Run migrations
cd backend
$env:DATABASE_URL = $dbUrl
npx prisma migrate deploy

# Seed RBAC
npx tsx src/db/seeds/rbac.seed.ts
```

## Step 3: Import Data to AWS RDS

Once migrations are complete, restore your data:

```bash
# Get AWS RDS database URL
DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id /nuvana-prod/database/url \
  --query 'SecretString' \
  --output text)

# Restore data
cd backend
DATABASE_URL=$DATABASE_URL node scripts/restore-to-aws.js
```

**On Windows PowerShell:**
```powershell
# Get database URL
$dbUrl = aws secretsmanager get-secret-value --secret-id /nuvana-prod/database/url --query 'SecretString' --output text

# Restore data
cd backend
$env:DATABASE_URL = $dbUrl
node scripts/restore-to-aws.js
```

## Verification

After migration, verify the data:

```bash
# Check user count
DATABASE_URL=$DATABASE_URL node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.user.count().then(c => { console.log('Users:', c); p.\$disconnect(); });"
```

Or use the check script:
```bash
DATABASE_URL=$DATABASE_URL node scripts/check-users.js
```

## Troubleshooting

### "Database schema not found" error
- Make sure migrations have been run: `npx prisma migrate deploy`
- Check that `_prisma_migrations` table exists

### "Unique constraint" errors during restore
- This is normal if data already exists
- The script uses `upsert` to handle duplicates

### Connection timeout
- Verify security groups allow access from your IP
- Check that RDS instance is in the same VPC as ECS tasks
- Verify database endpoint is correct

## Important Notes

⚠️ **WARNING**: The restore script will overwrite existing data in AWS RDS!

- Always backup AWS RDS before restoring if it has important data
- Test the restore process on a dev/staging environment first
- The script uses `upsert` to avoid duplicates, but be careful with production data

## Next Steps

After migration:
1. Verify all users can log in
2. Test critical workflows (transactions, shifts, etc.)
3. Monitor application logs for any data-related errors
4. Consider setting up automated backups for AWS RDS

