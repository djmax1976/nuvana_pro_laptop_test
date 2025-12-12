#!/bin/sh
# Railway startup script - runs migrations then starts the server

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting backend server..."
node dist/app.js

