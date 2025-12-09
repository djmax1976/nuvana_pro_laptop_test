output "db_password_secret_arn" {
  description = "ARN of the database password secret"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "db_password_secret_id" {
  description = "ID of the database password secret"
  value       = aws_secretsmanager_secret.db_password.id
}

output "database_url_secret_arn" {
  description = "ARN of the database URL secret"
  value       = aws_secretsmanager_secret.database_url.arn
}

output "database_url_secret_id" {
  description = "ID of the database URL secret"
  value       = aws_secretsmanager_secret.database_url.id
}

output "rabbitmq_password_secret_arn" {
  description = "ARN of the RabbitMQ password secret"
  value       = aws_secretsmanager_secret.rabbitmq_password.arn
}

output "rabbitmq_url_secret_arn" {
  description = "ARN of the RabbitMQ URL secret"
  value       = aws_secretsmanager_secret.rabbitmq_url.arn
}

output "rabbitmq_url_secret_id" {
  description = "ID of the RabbitMQ URL secret"
  value       = aws_secretsmanager_secret.rabbitmq_url.id
}

output "jwt_secret_arn" {
  description = "ARN of the JWT secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "jwt_refresh_secret_arn" {
  description = "ARN of the JWT refresh secret"
  value       = aws_secretsmanager_secret.jwt_refresh_secret.arn
}

output "cookie_secret_arn" {
  description = "ARN of the cookie secret"
  value       = aws_secretsmanager_secret.cookie_secret.arn
}

# Raw values for RDS/MQ module usage
output "db_password" {
  description = "Database password value"
  value       = random_password.db_password.result
  sensitive   = true
}

output "rabbitmq_password" {
  description = "RabbitMQ password value"
  value       = random_password.rabbitmq_password.result
  sensitive   = true
}
