# Next Steps: Database Migration Fix

## Overview
The database connection issue has been fixed by configuring migrations to run via ECS tasks within the VPC instead of directly from GitHub Actions.

## Step 1: Apply Terraform Changes

You need to apply the Terraform changes to create the migration task definition and update the RDS security group.

### Option A: Using GitHub Actions (Recommended)

1. Go to your GitHub repository
2. Navigate to **Actions** → **Terraform Infrastructure**
3. Click **Run workflow**
4. Select:
   - Environment: `prod`
   - Action: `plan`
5. Review the plan output
6. Run again with Action: `apply` (requires manual approval for production)

### Option B: Manual Terraform Apply

```bash
cd infrastructure/terraform

# Initialize Terraform (if not already done)
terraform init

# Review the plan
terraform plan -var-file=environments/prod/terraform.tfvars

# Apply the changes
terraform apply -var-file=environments/prod/terraform.tfvars
```

## Step 2: Verify Changes

After applying Terraform, verify:

1. **Migration task definition exists:**
   ```bash
   aws ecs describe-task-definition \
     --task-definition nuvana-prod-migration \
     --query 'taskDefinition.taskDefinitionArn'
   ```

2. **RDS security group allows ECS access:**
   ```bash
   aws ec2 describe-security-groups \
     --filters "Name=tag:Name,Values=nuvana-prod-rds-sg" \
     --query 'SecurityGroups[0].IpPermissions'
   ```

## Step 3: Test the Deployment

The next time you push to `main`, the deployment workflow will:
1. Build and push the backend Docker image
2. Run database migrations via ECS task (from within VPC)
3. Deploy the updated services

## What Was Changed

### Terraform Changes:
- ✅ Updated `main.tf` to pass ECS security group to RDS module
- ✅ Created migration task definition in ECS module
- ✅ Added CloudWatch log group for migrations
- ✅ Added migration task definition output

### GitHub Actions Changes:
- ✅ Removed direct migration execution (which failed due to network access)
- ✅ Added ECS task execution for migrations
- ✅ Migrations now run from within the VPC where database is accessible

## Troubleshooting

If migrations still fail:

1. **Check CloudWatch logs:**
   ```bash
   aws logs tail /ecs/nuvana-prod-cluster/migration --follow
   ```

2. **Verify task execution:**
   ```bash
   aws ecs list-tasks --cluster nuvana-prod-cluster \
     --family nuvana-prod-migration
   ```

3. **Check security group rules:**
   - RDS security group should allow inbound from ECS security group on port 5432
   - ECS security group should be able to reach RDS

## Notes

- The migration task uses minimal resources (256 CPU, 512 MB memory)
- Migrations run as one-time tasks (not a service)
- RBAC seed is currently disabled (tsx not available in production image)
- All migration logs are available in CloudWatch: `/ecs/nuvana-prod-cluster/migration`

