#!/usr/bin/env bash
set -euo pipefail

# URL health checker with timeout
# Usage: ./wait-for-url.sh <url> [timeout_seconds]

URL="${1:-}"
TIMEOUT="${2:-60}"

if [ -z "$URL" ]; then
  echo "Usage: $0 <url> [timeout_seconds]"
  exit 1
fi

echo "Waiting for $URL (timeout: ${TIMEOUT}s)..."

START_TIME=$(date +%s)
while true; do
  if curl -sf "$URL" > /dev/null 2>&1; then
    echo "✓ $URL is ready"
    exit 0
  fi

  ELAPSED=$(($(date +%s) - START_TIME))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "✗ Timeout after ${TIMEOUT}s waiting for $URL"
    exit 1
  fi

  sleep 2
done
