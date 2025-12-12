# Step-by-Step Guide: Downgrade AWS Infrastructure to Free Tier

## ⚠️ IMPORTANT WARNINGS

- **Downtime Expected**: 15-30 minutes during the transition
- **Data Loss Risk**: ElastiCache and Amazon MQ will be recreated (data will be lost)
- **RDS Backup**: We'll create a snapshot before changes
- **Cost Savings**: Moving from ~$200-300/month to ~$0-20/month (free tier limits)

## Prerequisites Checklist

- [ ] AWS CLI installed and configured
- [ ] Terraform installed (version >= 1.0)
- [ ] Access to AWS Console
- [ ] GitHub repository access
- [ ] Database backup script available

---

## STEP 1: Create RDS Database Snapshot (CRITICAL!)

**Why**: RDS instance modification can cause issues. Snapshot allows rollback.

```bash
# Get your RDS instance identifier
aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`nuvana-prod-postgres`].DBInstanceIdentifier' --output text

# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier nuvana-prod-postgres \
  --db-snapshot-identifier nuvana-prod-pre-downgrade-$(date +%Y%m%d-%H%M%S)

# Verify snapshot is creating
aws rds describe-db-snapshots \
  --db-snapshot-identifier nuvana-prod-pre-downgrade-* \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,Status]' \
  --output table
```

**Wait for snapshot status to be "available" before proceeding!**

---

## STEP 2: Export Current Database Data (Backup)

**Why**: Extra safety - have a JSON backup in addition to RDS snapshot.

```bash
cd backend

# Get database URL from AWS Secrets Manager
export DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id /nuvana-prod/database/url \
  --query 'SecretString' \
  --output text)

# Export database to JSON
node scripts/export-db.js

# Verify backup was created
ls -lh db-backup.json
```

**Expected**: `db-backup.json` file created in `backend/` directory

---

## STEP 3: Review Terraform Changes

**Verify the changes look correct:**

```bash
cd infrastructure/terraform

# Check what will change
git diff environments/prod/terraform.tfvars
```

**Expected changes:**
- `db_instance_class`: `db.m5.large` → `db.t3.micro`
- `redis_node_type`: `cache.m5.large` → `cache.t3.micro`
- `rabbitmq_instance_type`: `mq.m5.large` → `mq.t3.micro`

---

## STEP 4: Run Terraform Plan (Preview Changes)

**This shows what will happen WITHOUT making changes:**

```bash
cd infrastructure/terraform

# Initialize Terraform (if needed)
terraform init

# Generate plan
terraform plan \
  -var-file=environments/prod/terraform.tfvars \
  -out=downgrade-plan.tfplan
```

**Review the plan output carefully:**
- Look for "destroy" operations (ElastiCache, Amazon MQ)
- Look for "modify" operations (RDS)
- Note any warnings about data loss

**Save the plan output:**
```bash
terraform show downgrade-plan.tfplan > downgrade-plan-output.txt
```

---

## STEP 5: Commit Changes to Git

**Save your configuration changes:**

```bash
# From project root
git add infrastructure/terraform/environments/prod/terraform.tfvars
git commit -m "Downgrade AWS infrastructure to free tier for development"
git push origin main
```

---

## STEP 6: Apply Terraform Changes

**Option A: Using GitHub Actions (Recommended)**

1. Go to GitHub → Actions → "Terraform Infrastructure"
2. Click "Run workflow"
3. Select:
   - Environment: `prod`
   - Action: `plan`
4. Review the plan output
5. Run again with Action: `apply` (requires approval)

**Option B: Using Terraform CLI (Local)**

```bash
cd infrastructure/terraform

# Apply the changes
terraform apply downgrade-plan.tfplan
```

**This will:**
1. Modify RDS instance (15-20 minutes, brief downtime)
2. Delete and recreate ElastiCache (data lost)
3. Delete and recreate Amazon MQ (messages lost)

**Expected time**: 20-30 minutes total

---

## STEP 7: Verify Infrastructure

**Check all services are running:**

```bash
# Check RDS
aws rds describe-db-instances \
  --db-instance-identifier nuvana-prod-postgres \
  --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass]' \
  --output table

# Check ElastiCache
aws elasticache describe-cache-clusters \
  --cache-cluster-id nuvana-prod-redis \
  --query 'CacheClusters[0].[CacheClusterStatus,CacheNodeType]' \
  --output table

# Check Amazon MQ
aws mq list-brokers \
  --query 'BrokerSummaries[?contains(BrokerName, `nuvana-prod`)].{Name:BrokerName,Status:BrokerState}' \
  --output table
```

**All should show:**
- RDS: `available` and `db.t3.micro`
- ElastiCache: `available` and `cache.t3.micro`
- Amazon MQ: `RUNNING` and `mq.t3.micro`

---

## STEP 8: Test Application Connectivity

**Verify your application can connect:**

```bash
# Test database connection
export DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id /nuvana-prod/database/url \
  --query 'SecretString' \
  --output text)

cd backend
npx prisma db execute --stdin <<< "SELECT 1;"
```

**Expected**: Query executes successfully

---

## STEP 9: Monitor Performance

**Watch for issues in the first 24 hours:**

```bash
# Monitor RDS CPU credits
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUCreditBalance \
  --dimensions Name=DBInstanceIdentifier,Value=nuvana-prod-postgres \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --output table
```

**Watch CloudWatch for:**
- RDS: CPU credits, connections, latency
- ElastiCache: Memory usage, evictions
- Application: Error rates, response times

---

## STEP 10: Verify Cost Reduction

**Check AWS Billing Console:**
1. Go to AWS Console → Billing & Cost Management
2. Check current month's charges
3. Should see significant reduction (from ~$200-300 to ~$0-20/month)

---

## Rollback Plan (If Needed)

**If something goes wrong:**

### Rollback RDS:
```bash
# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier nuvana-prod-postgres-restored \
  --db-snapshot-identifier nuvana-prod-pre-downgrade-YYYYMMDD-HHMMSS

# Update Terraform to point to restored instance
# OR revert terraform.tfvars and reapply
```

### Rollback Infrastructure:
```bash
# Revert the config file
git revert HEAD
git push origin main

# Reapply with old instance types
cd infrastructure/terraform
terraform apply -var-file=environments/prod/terraform.tfvars
```

---

## Post-Downgrade Checklist

- [ ] RDS instance is `available` and `db.t3.micro`
- [ ] ElastiCache cluster is `available` and `cache.t3.micro`
- [ ] Amazon MQ broker is `RUNNING` and `mq.t3.micro`
- [ ] Application connects to all services
- [ ] Database queries work
- [ ] Application functionality tested
- [ ] CloudWatch metrics monitored
- [ ] Cost reduction verified
- [ ] Team notified of changes

---

## Notes

- **Free Tier Limits**: AWS Free Tier is typically for 12 months for new accounts
- **Performance**: Free tier instances have limited CPU/memory - monitor closely
- **Burst Credits**: t3.micro uses burstable performance - may throttle under load
- **Storage**: RDS storage costs still apply (not free tier)

---

## Support

If you encounter issues:
1. Check CloudWatch logs
2. Review Terraform plan output
3. Verify AWS service limits
4. Check AWS Free Tier eligibility
