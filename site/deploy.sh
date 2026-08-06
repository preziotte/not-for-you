#!/bin/bash

# Deploys site/public to AWS S3 and invalidates CloudFront cache.
# Run from anywhere; paths resolve relative to this script.
#
# What ships is a stripped copy of ./public, built into a temp directory that
# is thrown away afterwards. ./public itself is never written to: it stays the
# source of truth, comments and all.

DOMAIN_NAME="notforyou.app"
CF_DISTRIBUTION_ID="E30S2L1G5FFR6N"

set -e
cd "$(dirname "$0")"

echo "📦 Building..."
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
node ../scripts/build-site.mjs "$BUILD_DIR"

echo "🚀 Deploying to S3..."

# Sync all files with no-cache default (safe for HTML), handle deletions
aws s3 sync "$BUILD_DIR/" s3://$DOMAIN_NAME/ --delete \
  --cache-control "public, max-age=0, must-revalidate"

# Set 30-day cache on static images (favicons, logos, etc.)
echo "🖼️  Setting cache headers on images..."
aws s3 sync "$BUILD_DIR/" s3://$DOMAIN_NAME/ \
  --exclude "*" \
  --include "*.png" --include "*.jpg" --include "*.jpeg" \
  --include "*.gif" --include "*.webp" --include "*.svg" --include "*.ico" \
  --cache-control "public, max-age=2592000"

echo "🧹 Invalidating CloudFront cache..."
if [ -n "$CF_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id $CF_DISTRIBUTION_ID --paths "/*"
  echo "✅ CloudFront invalidation initiated"
else
  echo "⚠️  CloudFront distribution ID not set. Skipping invalidation."
  echo "   Get it from: terraform output cloudfront_distribution_main"
fi

echo "🎉 Deployment complete!"
echo "   Your site should be available at: https://$DOMAIN_NAME"
