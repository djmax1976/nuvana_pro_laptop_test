# =============================================================================
# ElastiCache Module - Redis
# =============================================================================

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------
resource "aws_security_group" "redis" {
  name        = "${var.name_prefix}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-redis-sg"
  })
}

# -----------------------------------------------------------------------------
# Subnet Group
# -----------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.name_prefix}-redis-subnet"
  description = "Subnet group for ElastiCache Redis"
  subnet_ids  = var.private_subnet_ids

  tags = var.tags
}

# -----------------------------------------------------------------------------
# ElastiCache Redis Cluster
# -----------------------------------------------------------------------------
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.name_prefix}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Maintenance
  maintenance_window = "sun:05:00-sun:06:00"

  # Snapshots
  snapshot_retention_limit = 1
  snapshot_window          = "04:00-05:00"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-redis"
  })
}
