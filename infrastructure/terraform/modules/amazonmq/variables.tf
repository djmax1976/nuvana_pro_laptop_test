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

variable "ecs_security_group_id" {
  description = "Security group ID of ECS tasks (for restricted access)"
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC for fallback ingress rules when ECS security group is not provided"
  type        = string
  default     = "10.0.0.0/16"
}
