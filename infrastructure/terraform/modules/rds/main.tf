# =============================================================================
# RDS Module - PostgreSQL Database
# =============================================================================

# -----------------------------------------------------------------------------
# Get DB Password from Secrets Manager
# -----------------------------------------------------------------------------
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = var.db_password_secret_arn
}

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------
resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  # Allow access from ECS security group if provided
  dynamic "ingress" {
    for_each = var.ecs_security_group_id != "" ? [1] : []
    content {
      description     = "PostgreSQL from ECS tasks"
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [var.ecs_security_group_id]
    }
  }

  # Allow access from bastion host if provided
  dynamic "ingress" {
    for_each = var.bastion_security_group_id != "" ? [1] : []
    content {
      description     = "PostgreSQL from bastion host"
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [var.bastion_security_group_id]
    }
  }

  # Fallback to VPC CIDR if no security groups provided
  dynamic "ingress" {
    for_each = var.ecs_security_group_id == "" && var.bastion_security_group_id == "" ? [1] : []
    content {
      description = "PostgreSQL from VPC (fallback)"
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = ["10.0.0.0/16"]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rds-sg"
  })
}

# -----------------------------------------------------------------------------
# DB Subnet Group
# -----------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name        = "${var.name_prefix}-db-subnet"
  description = "Subnet group for RDS"
  subnet_ids  = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-subnet"
  })
}

# -----------------------------------------------------------------------------
# RDS Instance
# -----------------------------------------------------------------------------
resource "aws_db_instance" "main" {
  identifier = "${var.name_prefix}-postgres"

  # Engine
  engine         = "postgres"
  engine_version = "15.10"
  instance_class = var.db_instance_class

  # Storage
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  # Database
  db_name  = var.db_name
  username = var.db_username
  password = data.aws_secretsmanager_secret_version.db_password.secret_string

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # Backup
  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Monitoring
  performance_insights_enabled = false # Not available on t3.micro

  # CloudWatch Logs - Required for security compliance
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  # Protection settings (configurable via variables)
  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = var.skip_final_snapshot
  final_snapshot_identifier  = "${var.name_prefix}-final-snapshot"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-postgres"
  })
}
