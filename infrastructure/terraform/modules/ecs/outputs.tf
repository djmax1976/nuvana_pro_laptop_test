output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "frontend_service_name" {
  description = "Frontend ECS service name"
  value       = aws_ecs_service.frontend.name
}

output "backend_service_name" {
  description = "Backend ECS service name"
  value       = aws_ecs_service.backend.name
}

output "worker_service_name" {
  description = "Worker ECS service name"
  value       = aws_ecs_service.worker.name
}

output "frontend_task_definition_arn" {
  description = "Frontend task definition ARN"
  value       = aws_ecs_task_definition.frontend.arn
}

output "backend_task_definition_arn" {
  description = "Backend task definition ARN"
  value       = aws_ecs_task_definition.backend.arn
}

output "worker_task_definition_arn" {
  description = "Worker task definition ARN"
  value       = aws_ecs_task_definition.worker.arn
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}
