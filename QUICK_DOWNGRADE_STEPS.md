# Quick Step-by-Step: Downgrade to Free Tier (No AWS CLI Required)

## ✅ What's Already Done
- Configuration file updated to free tier instances
- Terraform is installed and ready

---

## STEP 1: Create RDS Snapshot (AWS Console)

**Do this FIRST before any changes!**

1. Go to [AWS Console](https://console.aws.amazon.com) → RDS
2. Find your database: `nuvana-prod-postgres`
3. Select it → Actions → Take snapshot
4. Snapshot name: `nuvana-prod-pre-downgrade-[today's date]`
5. Click "Take Snapshot"
6. **WAIT** until status shows "Available" (takes 2-5 minutes)

**Why**: Safety backup in case we need to rollback

---

## STEP 2: Review the Changes

Let's see what we're changing:

```bash
cd infrastructure/terraform
git diff environments/prod/terraform.tfvars
```

**You should see:**
- RDS: `db.m5.large` → `db.t3.micro` ✅
- Redis: `cache.m5.large` → `cache.t3.micro` ✅  
- RabbitMQ: `mq.m5.large` → `mq.t3.micro` ✅

---

## STEP 3: Commit the Changes

Save the configuration to git:

```bash
# From project root
git add infrastructure/terraform/environments/prod/terraform.tfvars
git add DOWNGRADE_TO_FREE_TIER_GUIDE.md
git commit -m "Downgrade AWS infrastructure to free tier for development"
git push origin main
```

---

## STEP 4: Use GitHub Actions to Apply Changes

**This is the safest way - it will show you what will happen first!**

1. Go to your GitHub repository
2. Click **Actions** tab
3. Find **"Terraform Infrastructure"** workflow
4. Click **"Run workflow"** button (top right)
5. Select:
   - **Environment**: `prod`
   - **Action**: `plan` (this shows what will happen WITHOUT making changes)
6. Click **"Run workflow"**

**Wait for the plan to complete** (takes 2-3 minutes)

---

## STEP 5: Review the Plan

1. Click on the completed workflow run
2. Click on **"Plan (Prod)"** job
3. Scroll down to see the plan output
4. **Review carefully:**
   - Look for "will be destroyed" (ElastiCache, Amazon MQ)
   - Look for "will be modified" (RDS)
   - Note any warnings

**What to expect:**
- ✅ RDS will be modified (downgraded)
- ⚠️ ElastiCache will be destroyed and recreated (data lost)
- ⚠️ Amazon MQ will be destroyed and recreated (messages lost)

---

## STEP 6: Apply the Changes

**Once you've reviewed the plan and are ready:**

1. Go back to **Actions** → **"Terraform Infrastructure"**
2. Click **"Run workflow"** again
3. Select:
   - **Environment**: `prod`
   - **Action**: `apply` (this actually makes the changes)
4. Click **"Run workflow"**

**This will:**
- Require manual approval (GitHub will ask you to approve)
- Take 20-30 minutes to complete
- Cause brief downtime (5-15 minutes for RDS modification)

---

## STEP 7: Verify Everything Works

**After the workflow completes:**

1. Go to AWS Console → RDS
   - Check: `nuvana-prod-postgres` shows `db.t3.micro` and status `available`

2. Go to AWS Console → ElastiCache
   - Check: Redis cluster shows `cache.t3.micro` and status `available`

3. Go to AWS Console → Amazon MQ
   - Check: RabbitMQ broker shows `mq.t3.micro` and status `Running`

4. Test your application:
   - Try logging in
   - Test basic functionality
   - Check for any errors

---

## STEP 8: Monitor Performance

**Watch for the first 24 hours:**

1. Go to AWS Console → CloudWatch
2. Check RDS metrics:
   - CPU Utilization (should be low)
   - Database Connections
   - Read/Write Latency
3. Check ElastiCache metrics:
   - CPU Utilization
   - Memory Usage
   - Cache Hits/Misses

**If you see issues:**
- High CPU = may need to upgrade
- Connection errors = check application logs
- Slow queries = may need more resources

---

## ⚠️ Important Notes

1. **Downtime**: Expect 15-30 minutes of downtime during the transition
2. **Data Loss**: ElastiCache and Amazon MQ data will be lost (they're recreated)
3. **RDS Data**: Your database data is safe (we have snapshot backup)
4. **Cost**: Should drop from ~$200-300/month to ~$0-20/month
5. **Performance**: Free tier is much slower - monitor closely!

---

## 🆘 If Something Goes Wrong

**Rollback RDS:**
1. AWS Console → RDS → Snapshots
2. Find your snapshot: `nuvana-prod-pre-downgrade-[date]`
3. Select it → Actions → Restore snapshot
4. Restore to new instance or replace existing

**Rollback Infrastructure:**
1. Revert the commit in GitHub
2. Run the workflow again with old config

---

## ✅ Success Checklist

After completion, verify:
- [ ] RDS is `available` and `db.t3.micro`
- [ ] ElastiCache is `available` and `cache.t3.micro`
- [ ] Amazon MQ is `Running` and `mq.t3.micro`
- [ ] Application connects successfully
- [ ] Basic functionality works
- [ ] No critical errors in logs
- [ ] Cost reduction visible in AWS Billing

---

## Next Steps After Downgrade

1. **Monitor for 24-48 hours** - Watch for performance issues
2. **Check AWS Billing** - Verify cost reduction
3. **Update team** - Let them know about the changes
4. **Document** - Note any issues or adjustments needed
