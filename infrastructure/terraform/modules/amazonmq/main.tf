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

  # AMQP
  ingress {
    description = "AMQP from VPC"
    from_port   = 5671
    to_port     = 5671
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  # Management Console
  ingress {
    description = "RabbitMQ Console from VPC"
    from_port   = 443
    to_port     = 443
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
  subnet_ids          = [var.private_subnet_ids[0]]  # Single instance needs 1 subnet
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
}
