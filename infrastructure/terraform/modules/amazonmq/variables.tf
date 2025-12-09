variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "instance_type" {
  description = "Amazon MQ instance type"
  type        = string
}

variable "rabbitmq_password_secret_arn" {
  description = "ARN of the Secrets Manager secret containing RabbitMQ password"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
