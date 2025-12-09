# =============================================================================
# Development Environment Configuration
# =============================================================================

# General
aws_region  = "us-east-1"
environment = "dev"

# VPC
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]

# RDS PostgreSQL
db_name           = "nuvana"
db_username       = "nuvana_admin"
db_instance_class = "db.t3.micro"

# ElastiCache Redis
redis_node_type = "cache.t3.micro"

# Amazon MQ (RabbitMQ)
rabbitmq_instance_type = "mq.t3.micro"

# ECS Task Sizing (minimal for dev)
frontend_cpu    = 256
frontend_memory = 512
backend_cpu     = 256
backend_memory  = 512
worker_cpu      = 256
worker_memory   = 512

# Desired Counts
frontend_desired_count = 1
backend_desired_count  = 1
worker_desired_count   = 1

# SSL Certificate (leave empty for HTTP only)
certificate_arn = ""
