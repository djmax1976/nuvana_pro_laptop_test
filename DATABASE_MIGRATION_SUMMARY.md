# Database Migration Summary

## What Was Created

### 1. Export Script (`backend/scripts/export-db.js`)
- Exports all data from local Docker database to `backend/db-backup.json`
- Includes all tables: users, companies, stores, transactions, shifts, etc.

### 2. Restore Script (`backend/scripts/restore-to-aws.js`)
- Restores data from backup to AWS RDS
- Validates database schema exists before restoring
- Uses `upsert` to handle duplicates safely

### 3. Updated Deployment Workflow (`.github/workflows/deploy.yml`)
- **NEW**: Gets database URL from AWS Secrets Manager
- **NEW**: Generates Prisma Client
- **NEW**: Runs `prisma migrate deploy` to create schema
- **NEW**: Seeds RBAC roles and permissions
- These steps run BEFORE building Docker images

### 4. Migration Guide (`MIGRATION_GUIDE.md`)
- Step-by-step instructions for the complete migration process

## Migration Process

### Step 1: Export Local Data
```bash
cd backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_dev node scripts/export-db.js
```
This creates `backend/db-backup.json`

### Step 2: Deploy to AWS (Runs Migrations Automatically)
When you push to `main` branch, the deployment workflow will:
1. Get database URL from Secrets Manager
2. Run `prisma migrate deploy` (creates all tables)
3. Seed RBAC roles and permissions
4. Build and deploy Docker images

### Step 3: Restore Data to AWS
```bash
# Get AWS database URL
DATABASE_URL=$(aws secretsmanager get-secret-value --secret-id /nuvana-prod/database/url --query 'SecretString' --output text)

# Restore data
cd backend
DATABASE_URL=$DATABASE_URL node scripts/restore-to-aws.js
```

## What This Fixes

✅ **Database schema creation** - Migrations now run automatically on deployment  
✅ **RBAC setup** - Roles and permissions are seeded automatically  
✅ **Data migration** - Scripts to export/import your local data  
✅ **Future deployments** - Schema will be kept up-to-date automatically  

## Important Notes

- The deployment workflow will run migrations on EVERY deployment
- This ensures schema stays in sync with code
- RBAC seed is idempotent (safe to run multiple times)
- Data restore is a ONE-TIME operation (unless you want to re-import)

## Next Steps

1. **Export your local database** using the export script
2. **Push the updated deployment workflow** to trigger migrations
3. **Restore your data** using the restore script
4. **Verify** users can log in and data is accessible

