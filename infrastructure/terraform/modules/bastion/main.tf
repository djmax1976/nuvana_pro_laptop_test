# =============================================================================
# Bastion Host Module - SSH Tunnel Gateway
# =============================================================================

# -----------------------------------------------------------------------------
# Data Source: Latest Amazon Linux 2023 AMI
# -----------------------------------------------------------------------------
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# -----------------------------------------------------------------------------
# Key Pair (if creating new one)
# -----------------------------------------------------------------------------
resource "tls_private_key" "bastion_key" {
  count     = var.create_key_pair ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "bastion" {
  count      = var.create_key_pair ? 1 : 0
  key_name   = "${var.name_prefix}-bastion-key"
  public_key = tls_private_key.bastion_key[0].public_key_openssh

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion-key"
  })
}

# -----------------------------------------------------------------------------
# Security Group for Bastion Host
# -----------------------------------------------------------------------------
resource "aws_security_group" "bastion" {
  name        = "${var.name_prefix}-bastion-sg"
  description = "Security group for bastion host - allows SSH access"
  vpc_id      = var.vpc_id

  # SSH access from allowed CIDR blocks
  ingress {
    description = "SSH from allowed IPs"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  # Allow all outbound traffic
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion-sg"
  })
}

# -----------------------------------------------------------------------------
# IAM Role for Bastion (for Systems Manager access if needed)
# -----------------------------------------------------------------------------
resource "aws_iam_role" "bastion" {
  name = "${var.name_prefix}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.name_prefix}-bastion-profile"
  role = aws_iam_role.bastion.name

  tags = var.tags
}

# -----------------------------------------------------------------------------
# EC2 Instance - Bastion Host
# -----------------------------------------------------------------------------
resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_ids[0] # Use first public subnet
  vpc_security_group_ids = [aws_security_group.bastion.id]
  iam_instance_profile   = aws_iam_instance_profile.bastion.name

  # Use provided key or the one we created
  key_name = var.create_key_pair ? aws_key_pair.bastion[0].key_name : var.key_name

  # Enable detailed monitoring (optional)
  monitoring = false

  # User data to install PostgreSQL client tools
  user_data = <<-EOF
    #!/bin/bash
    # Update system
    dnf update -y
    
    # Install PostgreSQL client
    dnf install -y postgresql15
    
    # Install useful tools
    dnf install -y htop nano git
    
    # Create a helpful message
    cat > /etc/motd <<'MOTD'
    ============================================
    Nuvana Pro Bastion Host
    ============================================
    
    This host provides SSH tunnel access to RDS.
    
    To create an SSH tunnel:
    ssh -i <key-file> -L 5432:<rds-endpoint>:5432 ec2-user@$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
    
    Then connect pgAdmin4 to:
    - Host: localhost
    - Port: 5432
    - Database: nuvana
    - Username: nuvana_admin
    - Password: (from AWS Secrets Manager)
    ============================================
    MOTD
  EOF

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion"
  })

  lifecycle {
    create_before_destroy = true
  }
}
