# =============================================================================
# Nuvana Pro - AWS Infrastructure
# =============================================================================
# This Terraform configuration provisions the complete AWS infrastructure:
# - VPC with public/private subnets
# - ECS Fargate cluster for frontend, backend, and workers
# - RDS PostgreSQL database
# - ElastiCache Redis cluster
# - Amazon MQ RabbitMQ broker
# - Application Load Balancer
# - ECR repositories for container images
# - Secrets Manager for sensitive configuration
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "nuvana-terraform-state-652056695278"
    key            = "nuvana/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "nuvana-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "nuvana-pro"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# =============================================================================
# Local Variables
# =============================================================================
locals {
  name_prefix = "nuvana-${var.environment}"

  common_tags = {
    Project     = "nuvana-pro"
    Environment = var.environment
  }
}

# =============================================================================
# VPC Module
# =============================================================================
module "vpc" {
  source = "./modules/vpc"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones

  tags = local.common_tags
}

# =============================================================================
# ECR Repositories
# =============================================================================
module "ecr" {
  source = "./modules/ecr"

  name_prefix = local.name_prefix

  tags = local.common_tags
}

# =============================================================================
# Secrets Manager
# =============================================================================
module "secrets" {
  source = "./modules/secrets"

  name_prefix = local.name_prefix
  environment = var.environment

  tags = local.common_tags
}

# =============================================================================
# RDS PostgreSQL
# =============================================================================
module "rds" {
  source = "./modules/rds"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  db_name           = var.db_name
  db_username       = var.db_username
  db_instance_class = var.db_instance_class

  # Get password from Secrets Manager
  db_password_secret_arn = module.secrets.db_password_secret_arn

  tags = local.common_tags
}

# =============================================================================
# ElastiCache Redis
# =============================================================================
module "elasticache" {
  source = "./modules/elasticache"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  node_type = var.redis_node_type

  tags = local.common_tags
}

# =============================================================================
# Amazon MQ (RabbitMQ)
# =============================================================================
module "amazonmq" {
  source = "./modules/amazonmq"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  instance_type = var.rabbitmq_instance_type

  # Get credentials from Secrets Manager
  rabbitmq_password_secret_arn = module.secrets.rabbitmq_password_secret_arn

  tags = local.common_tags
}

# =============================================================================
# Application Load Balancer
# =============================================================================
module "alb" {
  source = "./modules/alb"

  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids

  certificate_arn = var.certificate_arn

  tags = local.common_tags
}

# =============================================================================
# ECS Cluster and Services
# =============================================================================
module "ecs" {
  source = "./modules/ecs"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # Container images
  frontend_image = "${module.ecr.frontend_repository_url}:latest"
  backend_image  = "${module.ecr.backend_repository_url}:latest"

  # ALB target groups
  frontend_target_group_arn = module.alb.frontend_target_group_arn
  backend_target_group_arn  = module.alb.backend_target_group_arn

  # Service discovery
  alb_security_group_id = module.alb.security_group_id

  # Database connection
  database_url_secret_arn = module.secrets.database_url_secret_arn

  # Redis connection
  redis_endpoint = module.elasticache.redis_endpoint
  redis_port     = module.elasticache.redis_port

  # RabbitMQ connection
  rabbitmq_endpoint_secret_arn = module.secrets.rabbitmq_url_secret_arn

  # JWT secrets
  jwt_secret_arn         = module.secrets.jwt_secret_arn
  jwt_refresh_secret_arn = module.secrets.jwt_refresh_secret_arn
  cookie_secret_arn      = module.secrets.cookie_secret_arn

  # Task sizing
  frontend_cpu    = var.frontend_cpu
  frontend_memory = var.frontend_memory
  backend_cpu     = var.backend_cpu
  backend_memory  = var.backend_memory
  worker_cpu      = var.worker_cpu
  worker_memory   = var.worker_memory

  # Desired counts
  frontend_desired_count = var.frontend_desired_count
  backend_desired_count  = var.backend_desired_count
  worker_desired_count   = var.worker_desired_count

  tags = local.common_tags
}
