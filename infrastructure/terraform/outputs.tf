# =============================================================================
# Outputs - Nuvana Pro Infrastructure
# =============================================================================

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

# -----------------------------------------------------------------------------
# ECR
# -----------------------------------------------------------------------------
output "frontend_ecr_repository_url" {
  description = "URL of the frontend ECR repository"
  value       = module.ecr.frontend_repository_url
}

output "backend_ecr_repository_url" {
  description = "URL of the backend ECR repository"
  value       = module.ecr.backend_repository_url
}

# -----------------------------------------------------------------------------
# RDS
# -----------------------------------------------------------------------------
output "rds_endpoint" {
  description = "RDS instance endpoint (full connection string)"
  value       = module.rds.endpoint
  sensitive   = true
}

output "rds_address" {
  description = "RDS instance address (hostname only, for SSH tunnel)"
  value       = module.rds.address
  sensitive   = true
}

output "rds_port" {
  description = "RDS instance port"
  value       = module.rds.port
}

# -----------------------------------------------------------------------------
# ElastiCache
# -----------------------------------------------------------------------------
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.elasticache.redis_endpoint
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.redis_port
}

# -----------------------------------------------------------------------------
# Amazon MQ
# -----------------------------------------------------------------------------
output "rabbitmq_endpoint" {
  description = "RabbitMQ broker endpoint"
  value       = module.amazonmq.broker_endpoint
  sensitive   = true
}

output "rabbitmq_console_url" {
  description = "RabbitMQ management console URL"
  value       = module.amazonmq.console_url
}

# -----------------------------------------------------------------------------
# ALB
# -----------------------------------------------------------------------------
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the ALB for Route 53 alias records"
  value       = module.alb.zone_id
}

# -----------------------------------------------------------------------------
# ACM Certificate
# -----------------------------------------------------------------------------
output "certificate_arn" {
  description = "ARN of the ACM certificate (if created)"
  value       = var.create_certificate && var.domain_name != "" ? module.acm[0].certificate_arn : var.certificate_arn
}

output "certificate_validation_records" {
  description = "DNS validation records for the certificate (add these to your domain DNS)"
  value       = var.create_certificate && var.domain_name != "" ? module.acm[0].validation_records : null
  sensitive   = false
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "frontend_service_name" {
  description = "Name of the frontend ECS service"
  value       = module.ecs.frontend_service_name
}

output "backend_service_name" {
  description = "Name of the backend ECS service"
  value       = module.ecs.backend_service_name
}

# -----------------------------------------------------------------------------
# Bastion Host
# -----------------------------------------------------------------------------
output "bastion_public_ip" {
  description = "Public IP address of the bastion host"
  value       = module.bastion.public_ip
}

output "bastion_public_dns" {
  description = "Public DNS name of the bastion host"
  value       = module.bastion.public_dns
}

output "bastion_key_name" {
  description = "Name of the key pair for the bastion host"
  value       = module.bastion.key_name
}

output "bastion_private_key" {
  description = "Private key for the bastion host (sensitive - save this securely!)"
  value       = module.bastion.private_key_pem
  sensitive   = true
}

output "bastion_ssh_command" {
  description = "SSH command to connect to bastion host"
  value       = "ssh -i <key-file> ec2-user@${module.bastion.public_ip}"
}

output "bastion_tunnel_command" {
  description = "SSH tunnel command to forward RDS port"
  value       = "ssh -i <key-file> -L 5432:${module.rds.address}:5432 ec2-user@${module.bastion.public_ip}"
}

# -----------------------------------------------------------------------------
# Application URLs
# -----------------------------------------------------------------------------
output "application_url" {
  description = "URL to access the application"
  value       = "http://${module.alb.dns_name}"
}

output "api_url" {
  description = "URL to access the API"
  value       = "http://${module.alb.dns_name}/api"
}
