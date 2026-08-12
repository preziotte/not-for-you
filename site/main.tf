# AWS Static Website Hosting with Terraform

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Variables
variable "domain_name" {
  description = "The domain name for the website (e.g., example.com)"
  type        = string
}

variable "region" {
  description = "The AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

# Provider configuration
provider "aws" {
  region = var.region
}

# ACM Certificate (must be in us-east-1 for CloudFront)
provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"
}

# Route 53 Zone — created by terraform; grab the NS records from `terraform output name_servers`
# and set them at the registrar where the domain was purchased.
resource "aws_route53_zone" "zone" {
  name = var.domain_name
}

# S3 bucket for the main domain
resource "aws_s3_bucket" "main" {
  bucket = var.domain_name

  tags = {
    Name = var.domain_name
  }
}

# S3 bucket for www subdomain (redirect)
resource "aws_s3_bucket" "www" {
  bucket = "www.${var.domain_name}"

  tags = {
    Name = "www.${var.domain_name}"
  }
}

# Configure main bucket for website hosting
resource "aws_s3_bucket_website_configuration" "main" {
  bucket = aws_s3_bucket.main.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# Configure www bucket to redirect to main domain
resource "aws_s3_bucket_website_configuration" "www" {
  bucket = aws_s3_bucket.www.id

  redirect_all_requests_to {
    host_name = var.domain_name
    protocol  = "https"
  }
}

# Set main bucket public access
resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Set www bucket public access
resource "aws_s3_bucket_public_access_block" "www" {
  bucket = aws_s3_bucket.www.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 bucket policy for main domain
resource "aws_s3_bucket_policy" "main" {
  bucket = aws_s3_bucket.main.id
  policy = jsonencode({
    Version = "2008-10-17"
    Statement = [
      {
        Sid       = "PublicReadForGetBucketObjects"
        Effect    = "Allow"
        Principal = { AWS = "*" }
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${var.domain_name}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.main]
}

# ACM Certificate
resource "aws_acm_certificate" "cert" {
  provider                  = aws.us-east-1
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Route 53 record for ACM validation
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.zone.zone_id
}

# ACM Certificate validation
resource "aws_acm_certificate_validation" "cert" {
  provider                = aws.us-east-1
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# Rewrites clean URLs (/privacy) to the .html objects S3 actually holds,
# and redirects trailing slashes to the bare path. See url-rewrite.js.
resource "aws_cloudfront_function" "url_rewrite" {
  name    = "${replace(var.domain_name, ".", "-")}-url-rewrite"
  # The aws provider is pinned to ~> 4.0, which predates cloudfront-js-2.0.
  # The 1.0 runtime covers everything url-rewrite.js uses.
  runtime = "cloudfront-js-1.0"
  comment = "Clean URLs: map extensionless paths to .html"
  publish = true
  code    = file("${path.module}/url-rewrite.js")
}

# CloudFront distribution for main domain
resource "aws_cloudfront_distribution" "main" {
  origin {
    domain_name = aws_s3_bucket_website_configuration.main.website_endpoint
    origin_id   = "S3-${var.domain_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.domain_name}"

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.url_rewrite.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  price_class = "PriceClass_100"
}

# CloudFront distribution for www subdomain
resource "aws_cloudfront_distribution" "www" {
  origin {
    domain_name = aws_s3_bucket_website_configuration.www.website_endpoint
    origin_id   = "S3-www.${var.domain_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled         = true
  is_ipv6_enabled = true
  aliases         = ["www.${var.domain_name}"]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-www.${var.domain_name}"

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  price_class = "PriceClass_100"
}

# Route 53 A record for apex domain
resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.zone.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# Google Search Console domain verification
resource "aws_route53_record" "google_site_verification" {
  zone_id = aws_route53_zone.zone.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 300
  records = ["google-site-verification=FzxOfajj0iaPWKdJMoeTo3ENL3AJYZBPN8EKr8olzBg"]
}

# Route 53 A record for www subdomain
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.zone.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.www.domain_name
    zone_id                = aws_cloudfront_distribution.www.hosted_zone_id
    evaluate_target_health = false
  }
}

# Outputs
output "website_endpoint" {
  value = "https://${var.domain_name}"
}

output "www_endpoint" {
  value = "https://www.${var.domain_name}"
}

output "s3_bucket_main" {
  value = aws_s3_bucket.main.bucket
}

output "s3_bucket_www" {
  value = aws_s3_bucket.www.bucket
}

output "cloudfront_distribution_main" {
  value = aws_cloudfront_distribution.main.id
}

output "cloudfront_distribution_www" {
  value = aws_cloudfront_distribution.www.id
}

output "name_servers" {
  description = "Set these as the nameservers at your domain registrar"
  value       = aws_route53_zone.zone.name_servers
}
