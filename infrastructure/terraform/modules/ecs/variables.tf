variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

# Container Images
variable "frontend_image" {
  description = "Frontend container image URL"
  type        = string
}

variable "backend_image" {
  description = "Backend container image URL"
  type        = string
}

# ALB
variable "frontend_target_group_arn" {
  description = "ARN of the frontend ALB target group"
  type        = string
}

variable "backend_target_group_arn" {
  description = "ARN of the backend ALB target group"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group ID of the ALB"
  type        = string
}

variable "alb_dns_name" {
  description = "DNS name of the ALB (for internal routing)"
  type        = string
}

variable "frontend_url" {
  description = "Frontend domain URL (e.g., 'https://staging.nuvanaapp.com') for client-side API calls"
  type        = string
  default     = ""
}

# Database
variable "database_url_secret_arn" {
  description = "ARN of the DATABASE_URL secret"
  type        = string
}

# Redis
variable "redis_endpoint" {
  description = "Redis endpoint"
  type        = string
}

variable "redis_port" {
  description = "Redis port"
  type        = number
}

# RabbitMQ
variable "rabbitmq_endpoint_secret_arn" {
  description = "ARN of the RabbitMQ URL secret"
  type        = string
}

# JWT Secrets
variable "jwt_secret_arn" {
  description = "ARN of the JWT secret"
  type        = string
}

variable "jwt_refresh_secret_arn" {
  description = "ARN of the JWT refresh secret"
  type        = string
}

variable "cookie_secret_arn" {
  description = "ARN of the cookie secret"
  type        = string
}

# Task Sizing
variable "frontend_cpu" {
  description = "Frontend task CPU units"
  type        = number
}

variable "frontend_memory" {
  description = "Frontend task memory in MB"
  type        = number
}

variable "backend_cpu" {
  description = "Backend task CPU units"
  type        = number
}

variable "backend_memory" {
  description = "Backend task memory in MB"
  type        = number
}

variable "worker_cpu" {
  description = "Worker task CPU units"
  type        = number
}

variable "worker_memory" {
  description = "Worker task memory in MB"
  type        = number
}

# Desired Counts
variable "frontend_desired_count" {
  description = "Number of frontend tasks"
  type        = number
}

variable "backend_desired_count" {
  description = "Number of backend tasks"
  type        = number
}

variable "worker_desired_count" {
  description = "Number of worker tasks"
  type        = number
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "cors_origin" {
  description = "Allowed CORS origin(s) for the backend API. Can be a single origin (e.g., 'https://example.com') or comma-separated list of origins (e.g., 'https://example.com,https://www.example.com'). Must be explicitly set - no default for security."
  type        = string
}
