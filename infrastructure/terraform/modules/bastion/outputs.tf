output "instance_id" {
  description = "ID of the bastion host instance"
  value       = aws_instance.bastion.id
}

output "public_ip" {
  description = "Public IP address of the bastion host"
  value       = aws_instance.bastion.public_ip
}

output "public_dns" {
  description = "Public DNS name of the bastion host"
  value       = aws_instance.bastion.public_dns
}

output "security_group_id" {
  description = "Security group ID of the bastion host"
  value       = aws_security_group.bastion.id
}

output "key_name" {
  description = "Name of the key pair used for the bastion host"
  value       = var.create_key_pair ? aws_key_pair.bastion[0].key_name : var.key_name
}

output "private_key_pem" {
  description = "Private key in PEM format (only if created)"
  value       = var.create_key_pair ? tls_private_key.bastion_key[0].private_key_pem : null
  sensitive   = true
}

output "ssh_command" {
  description = "SSH command to connect to bastion host"
  value       = "ssh -i <key-file> ec2-user@${aws_instance.bastion.public_ip}"
}

output "tunnel_command" {
  description = "SSH tunnel command to forward RDS port"
  value       = "ssh -i <key-file> -L 5432:<rds-endpoint>:5432 ec2-user@${aws_instance.bastion.public_ip}"
}
