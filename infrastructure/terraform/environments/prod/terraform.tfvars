# =============================================================================
# Production Environment Configuration
# =============================================================================

# General
aws_region  = "us-east-1"
environment = "prod"

# VPC
vpc_cidr           = "10.1.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]

# RDS PostgreSQL
db_name           = "nuvana"
db_username       = "nuvana_admin"
db_instance_class = "db.t3.small" # Upgrade for production

# ElastiCache Redis
redis_node_type = "cache.t3.small" # Upgrade for production

# Amazon MQ (RabbitMQ)
rabbitmq_instance_type = "mq.t3.micro"

# ECS Task Sizing (production-ready)
frontend_cpu    = 512
frontend_memory = 1024
backend_cpu     = 512
backend_memory  = 1024
worker_cpu      = 256
worker_memory   = 512

# Desired Counts (scale for production)
frontend_desired_count = 2
backend_desired_count  = 2
worker_desired_count   = 2

# SSL Certificate (add your ACM certificate ARN)
certificate_arn = ""
