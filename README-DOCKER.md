# Docker Setup for Nuvana

## Current Issues Fixed

### 1. Docker Container Organization
- **Problem**: Containers were manually named (`nuvana-postgres`, `nuvana-redis`, etc.) instead of using docker-compose project structure
- **Solution**: Created `docker-compose.yml` with proper project naming that matches the `free-game-battles` pattern
- **Result**: Containers will now be organized as `nuvana-postgres-1`, `nuvana-redis-1`, `nuvana-rabbitmq-1`

### 2. Localhost Not Reachable
- **Problem**: Backend (port 3001) and Frontend (port 3000) services are not running
- **Solution**: Need to start both services manually or via scripts

## Setup Instructions

### 1. Stop Existing Containers (if running manually)
```bash
docker stop nuvana-postgres nuvana-redis nuvana-rabbitmq
docker rm nuvana-postgres nuvana-redis nuvana-rabbitmq
```

### 2. Start Docker Services
```bash
# Using docker-compose with project name
docker-compose --env-file .docker-compose.env up -d

# Or set environment variable
$env:COMPOSE_PROJECT_NAME="nuvana"
docker-compose up -d
```

### 3. Verify Containers
```bash
docker ps
# Should show: nuvana-postgres-1, nuvana-redis-1, nuvana-rabbitmq-1
```

### 4. Start Backend Server
```bash
cd backend
npm install
npm run build
npm run dev
# Backend should start on http://localhost:3001
```

### 5. Start Frontend Server
```bash
# In a new terminal
npm install
npm run dev
# Frontend should start on http://localhost:3000
```

## Container Naming Pattern

Following the `free-game-battles` pattern:
- Project name: `nuvana`
- Container names: `nuvana-{service}-{number}`
- Example: `nuvana-postgres-1`, `nuvana-redis-1`, `nuvana-rabbitmq-1`

This keeps all containers organized under the project name, making it easy to:
- List all project containers: `docker ps --filter "name=nuvana"`
- Stop all project containers: `docker-compose down`
- Remove all project containers: `docker-compose down -v`

## Environment Variables

The backend expects these environment variables (create `backend/.env`):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_dev
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## Troubleshooting

### Port Already in Use
If ports 5432, 6379, or 5672 are already in use:
1. Stop the conflicting containers
2. Or modify port mappings in `docker-compose.yml`

### Backend Won't Start
- Check that PostgreSQL, Redis, and RabbitMQ containers are running
- Verify environment variables in `backend/.env`
- Check backend logs: `cd backend && npm run dev`

### Frontend Won't Connect to Backend
- Verify backend is running on port 3001
- Check `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- Verify CORS settings in `backend/src/app.ts`

