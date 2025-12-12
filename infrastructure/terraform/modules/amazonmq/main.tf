# =============================================================================
# Amazon MQ Module - RabbitMQ
# =============================================================================

# -----------------------------------------------------------------------------
# Get RabbitMQ Password from Secrets Manager
# -----------------------------------------------------------------------------
data "aws_secretsmanager_secret_version" "rabbitmq_password" {
  secret_id = var.rabbitmq_password_secret_arn
}

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------
resource "aws_security_group" "rabbitmq" {
  name        = "${var.name_prefix}-rabbitmq-sg"
  description = "Security group for Amazon MQ RabbitMQ"
  vpc_id      = var.vpc_id

  # AMQP - Prefer security group reference over CIDR when available
  dynamic "ingress" {
    for_each = var.ecs_security_group_id != "" ? [1] : []
    content {
      description     = "AMQP from ECS tasks"
      from_port       = 5671
      to_port         = 5671
      protocol        = "tcp"
      security_groups = [var.ecs_security_group_id]
    }
  }

  dynamic "ingress" {
    for_each = var.ecs_security_group_id == "" ? [1] : []
    content {
      description = "AMQP from VPC (fallback)"
      from_port   = 5671
      to_port     = 5671
      protocol    = "tcp"
      cidr_blocks = [var.vpc_cidr]
    }
  }

  # Management Console - Prefer security group reference over CIDR when available
  dynamic "ingress" {
    for_each = var.ecs_security_group_id != "" ? [1] : []
    content {
      description     = "RabbitMQ Console from ECS tasks"
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      security_groups = [var.ecs_security_group_id]
    }
  }

  dynamic "ingress" {
    for_each = var.ecs_security_group_id == "" ? [1] : []
    content {
      description = "RabbitMQ Console from VPC (fallback)"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = [var.vpc_cidr]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rabbitmq-sg"
  })
}

# -----------------------------------------------------------------------------
# Amazon MQ Broker (RabbitMQ)
# -----------------------------------------------------------------------------
resource "aws_mq_broker" "main" {
  broker_name = "${var.name_prefix}-rabbitmq"

  engine_type                = "RabbitMQ"
  engine_version             = "3.13"
  host_instance_type         = var.instance_type
  deployment_mode            = "SINGLE_INSTANCE"
  auto_minor_version_upgrade = true

  # Authentication
  user {
    username = "nuvana"
    password = data.aws_secretsmanager_secret_version.rabbitmq_password.secret_string
  }

  # Network
  publicly_accessible = false
  subnet_ids          = [var.private_subnet_ids[0]] # Single instance needs 1 subnet
  security_groups     = [aws_security_group.rabbitmq.id]

  # Maintenance
  maintenance_window_start_time {
    day_of_week = "SUNDAY"
    time_of_day = "06:00"
    time_zone   = "UTC"
  }

  # Logs
  logs {
    general = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rabbitmq"
  })

  # Force replacement when instance type changes (AWS doesn't allow downgrades)
  lifecycle {
    create_before_destroy = true
    replace_triggered_by = [
      var.instance_type
    ]
  }
}
