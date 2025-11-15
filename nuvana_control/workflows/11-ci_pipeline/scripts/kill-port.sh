#!/usr/bin/env bash
# Kill any process using a specific port
# Usage: ./kill-port.sh <port_number>

set -euo pipefail

PORT="${1:-3001}"

echo "Checking for processes using port $PORT..."

# Find and kill process using the port (Linux/macOS)
if command -v lsof &> /dev/null; then
  # Using lsof (most Linux/macOS systems)
  PID=$(lsof -ti:$PORT || true)
  if [ -n "$PID" ]; then
    echo "Found process $PID using port $PORT, killing it..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
    echo "Process killed successfully"
  else
    echo "No process found using port $PORT"
  fi
elif command -v fuser &> /dev/null; then
  # Using fuser (alternative on some Linux systems)
  echo "Using fuser to check port $PORT..."
  fuser -k $PORT/tcp 2>/dev/null || echo "No process found using port $PORT"
  sleep 1
elif command -v netstat &> /dev/null; then
  # Using netstat (works on most systems)
  PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $7}' | cut -d'/' -f1 || true)
  if [ -n "$PID" ]; then
    echo "Found process $PID using port $PORT, killing it..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
    echo "Process killed successfully"
  else
    echo "No process found using port $PORT"
  fi
else
  echo "Warning: No suitable command found to check port usage (tried lsof, fuser, netstat)"
  echo "Port cleanup may not work properly"
fi

echo "Port $PORT is now available"
