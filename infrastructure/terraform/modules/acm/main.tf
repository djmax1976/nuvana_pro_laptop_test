# =============================================================================
# ACM Certificate Module
# =============================================================================

# Request SSL certificate from AWS Certificate Manager
resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  # Add subject alternative names if provided
  subject_alternative_names = var.subject_alternative_names

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-certificate"
  })
}

# Certificate validation records (for Route 53)
resource "aws_acm_certificate_validation" "main" {
  count = var.create_validation_records ? 1 : 0

  certificate_arn = aws_acm_certificate.main.arn

  validation_record_fqdns = [
    for record in aws_route53_record.validation : record.fqdn
  ]

  timeouts {
    create = "5m"
  }
}

# Route 53 validation records (if hosted zone provided)
resource "aws_route53_record" "validation" {
  for_each = var.create_validation_records && var.hosted_zone_id != "" ? {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.hosted_zone_id
}
