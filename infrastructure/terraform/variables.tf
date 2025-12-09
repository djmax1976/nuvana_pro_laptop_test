# =============================================================================
# Variables - Nuvana Pro Infrastructure
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# -----------------------------------------------------------------------------
# RDS PostgreSQL
# -----------------------------------------------------------------------------
variable "db_name" {
  description = "Name of the database"
  type        = string
  default     = "nuvana"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "nuvana_admin"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"  # Free tier eligible
}

# -----------------------------------------------------------------------------
# ElastiCache Redis
# -----------------------------------------------------------------------------
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

# -----------------------------------------------------------------------------
# Amazon MQ (RabbitMQ)
# -----------------------------------------------------------------------------
variable "rabbitmq_instance_type" {
  description = "Amazon MQ instance type"
  type        = string
  default     = "mq.t3.micro"
}

# -----------------------------------------------------------------------------
# ECS Task Sizing
# -----------------------------------------------------------------------------
variable "frontend_cpu" {
  description = "Frontend task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Frontend task memory in MB"
  type        = number
  default     = 512
}

variable "backend_cpu" {
  description = "Backend task CPU units"
  type        = number
  default     = 256
}

variable "backend_memory" {
  description = "Backend task memory in MB"
  type        = number
  default     = 512
}

variable "worker_cpu" {
  description = "Worker task CPU units"
  type        = number
  default     = 256
}

variable "worker_memory" {
  description = "Worker task memory in MB"
  type        = number
  default     = 512
}

# -----------------------------------------------------------------------------
# ECS Desired Counts
# -----------------------------------------------------------------------------
variable "frontend_desired_count" {
  description = "Number of frontend tasks"
  type        = number
  default     = 1
}

variable "backend_desired_count" {
  description = "Number of backend tasks"
  type        = number
  default     = 1
}

variable "worker_desired_count" {
  description = "Number of worker tasks"
  type        = number
  default     = 1
}

# -----------------------------------------------------------------------------
# SSL Certificate (optional)
# -----------------------------------------------------------------------------
variable "certificate_arn" {
  description = "ARN of ACM certificate for HTTPS (optional)"
  type        = string
  default     = ""
}
