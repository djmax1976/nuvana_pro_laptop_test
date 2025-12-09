output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_cluster.main.port
}

output "security_group_id" {
  description = "Security group ID for Redis"
  value       = aws_security_group.redis.id
}
