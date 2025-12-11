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
# Fixed-performance instance (db.m5.large) provides sustained CPU/memory without burst credits.
# General-purpose M5 family offers 2 vCPU, 8 GiB RAM, and baseline network performance.
# Use db.r5.large if memory-optimized workloads are required (13 GiB RAM, same vCPU).
# Monitor CloudWatch metrics (CPUUtilization, DatabaseConnections, ReadLatency, WriteLatency)
# to validate sizing and adjust based on actual production load patterns.
db_instance_class = "db.m5.large"

# ElastiCache Redis
# Fixed-performance instance (cache.m5.large) provides sustained throughput without burst credits.
# M5 family offers 2 vCPU, 6.64 GiB usable memory, and baseline network performance.
# Monitor CloudWatch metrics (CPUUtilization, NetworkBytesIn/Out, Evictions, CacheHits/Misses)
# to validate sizing. Consider cache.r5.large (13.07 GiB) if memory-bound, or cache.m5.xlarge
# (4 vCPU, 13.31 GiB) if CPU-bound workloads are observed.
redis_node_type = "cache.m5.large"

# Amazon MQ (RabbitMQ)
# Fixed-performance instance (mq.m5.large) provides sustained CPU/memory for message processing.
# M5 family offers 2 vCPU, 8 GiB RAM, and baseline network performance suitable for production workloads.
# Monitor CloudWatch metrics (QueueDepth, MessageCount, ConsumerCount, PublishRate) to validate sizing.
# Consider mq.m5.xlarge (4 vCPU, 16 GiB) if high message throughput or large queue depths are observed.
rabbitmq_instance_type = "mq.m5.large"

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
