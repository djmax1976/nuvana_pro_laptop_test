# =============================================================================
# Secrets Module - AWS Secrets Manager
# =============================================================================

# -----------------------------------------------------------------------------
# Random Password Generation
# -----------------------------------------------------------------------------
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "rabbitmq_password" {
  length           = 32
  special          = false  # RabbitMQ has restrictions on special chars
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false
}

resource "random_password" "cookie_secret" {
  length  = 64
  special = false
}

# -----------------------------------------------------------------------------
# Database Password Secret
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "db_password" {
  name        = "/${var.name_prefix}/database/password"
  description = "PostgreSQL database password for Nuvana Pro"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# -----------------------------------------------------------------------------
# Database URL Secret (will be updated after RDS is created)
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "database_url" {
  name        = "/${var.name_prefix}/database/url"
  description = "Full PostgreSQL connection URL for Nuvana Pro"

  tags = var.tags
}

# Placeholder - actual URL set after RDS creation
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://placeholder:placeholder@localhost:5432/nuvana"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# -----------------------------------------------------------------------------
# RabbitMQ Password Secret
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "rabbitmq_password" {
  name        = "/${var.name_prefix}/rabbitmq/password"
  description = "RabbitMQ password for Nuvana Pro"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "rabbitmq_password" {
  secret_id     = aws_secretsmanager_secret.rabbitmq_password.id
  secret_string = random_password.rabbitmq_password.result
}

# -----------------------------------------------------------------------------
# RabbitMQ URL Secret
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "rabbitmq_url" {
  name        = "/${var.name_prefix}/rabbitmq/url"
  description = "Full RabbitMQ connection URL for Nuvana Pro"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "rabbitmq_url" {
  secret_id     = aws_secretsmanager_secret.rabbitmq_url.id
  secret_string = "amqp://placeholder:placeholder@localhost:5672"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# -----------------------------------------------------------------------------
# JWT Secret
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "/${var.name_prefix}/jwt/secret"
  description = "JWT signing secret for Nuvana Pro"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# -----------------------------------------------------------------------------
# JWT Refresh Secret
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_refresh_secret" {
  name        = "/${var.name_prefix}/jwt/refresh-secret"
  description = "JWT refresh token signing secret for Nuvana Pro"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "jwt_refresh_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_refresh_secret.id
  secret_string = random_password.jwt_refresh_secret.result
}

# -----------------------------------------------------------------------------
# Cookie Secret
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "cookie_secret" {
  name        = "/${var.name_prefix}/cookie/secret"
  description = "Cookie signing secret for Nuvana Pro"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "cookie_secret" {
  secret_id     = aws_secretsmanager_secret.cookie_secret.id
  secret_string = random_password.cookie_secret.result
}
