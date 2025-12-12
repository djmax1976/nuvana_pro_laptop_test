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
db_name     = "nuvana"
db_username = "nuvana_admin"
# Free tier eligible instance (db.t3.micro) - 2 vCPU (burstable), 1 GiB RAM
# Note: This is a significant downgrade from db.m5.large. Suitable for development/testing only.
# Monitor CloudWatch metrics (CPUUtilization, DatabaseConnections, ReadLatency, WriteLatency)
# to validate sizing and adjust based on actual production load patterns.
db_instance_class = "db.t3.micro"

# ElastiCache Redis
# Free tier eligible instance (cache.t3.micro) - 2 vCPU (burstable), 0.5 GiB usable memory
# Note: This is a significant downgrade from cache.m5.large. Suitable for development/testing only.
# Monitor CloudWatch metrics (CPUUtilization, NetworkBytesIn/Out, Evictions, CacheHits/Misses)
# to validate sizing.
redis_node_type = "cache.t3.micro"

# Amazon MQ (RabbitMQ)
# Free tier eligible instance (mq.t3.micro) - 2 vCPU (burstable), 1 GiB RAM
# Note: This is a significant downgrade from mq.m5.large. Suitable for development/testing only.
# Monitor CloudWatch metrics (QueueDepth, MessageCount, ConsumerCount, PublishRate) to validate sizing.
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

# SSL Certificate Configuration
create_certificate = true
domain_name        = "staging.nuvanaapp.com"
certificate_arn    = ""

# CORS Configuration
# Will update to HTTPS after certificate is validated
cors_origin = "https://staging.nuvanaapp.com"
