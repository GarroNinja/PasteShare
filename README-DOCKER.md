# PasteShare - Docker Deployment

This guide explains how to run PasteShare locally using Docker containers with Supabase database.

## Prerequisites

- Docker and Docker Compose installed on your system
- At least 1GB of free disk space
- Ports 80 and 3000 available on your system
- Supabase account and database URL

## Quick Start

1. **Clone and navigate to the project directory:**
   ```bash
   git clone <repository-url>
   cd PasteShare
   ```

2. **Create your .env file:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Supabase DATABASE_URL:
   ```env
   DATABASE_URL=postgresql://your_user:your_password@your_host:6543/postgres
   NODE_ENV=production
   PORT=3000
   UPLOAD_DIR=/app/uploads
   ```

3. **Start all services:**
   ```bash
   ./setup-docker.sh
   ```

4. **Access the application:**
   - Frontend: http://localhost (port 80)
   - Backend API: http://localhost:3000
   - Database: Supabase (remote)

## Services

### Frontend (React)
- **Container:** `pasteshare-client`
- **Port:** 80
- **Technology:** React app served by Nginx
- **Build:** Multi-stage build with optimized production bundle

### Backend (Node.js)
- **Container:** `pasteshare-server`
- **Port:** 3000
- **Technology:** Express.js with TypeScript
- **Features:** File uploads, paste management, API endpoints
- **Database:** Connects to Supabase PostgreSQL

## Management Commands

### Start services
```bash
./setup-docker.sh
# or manually
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
```

### Rebuild services
```bash
# Rebuild all
docker-compose up --build -d

# Rebuild specific service
docker-compose up --build -d server
```

## Environment Variables

Required environment variables in your `.env` file:

```env
# Database configuration (Required)
DATABASE_URL=postgresql://your_user:your_password@your_host:6543/postgres

# Server configuration
NODE_ENV=production
PORT=3000
UPLOAD_DIR=/app/uploads
```

## Data Persistence

- **Database:** Hosted on Supabase (persistent)
- **Upload files:** `uploads_data` Docker volume

To reset upload files:
```bash
docker-compose down -v
docker volume rm pasteshare_uploads_data
```

## Development

For development with file watching and hot reload:

1. **Start development environment:**
   ```bash
   ./setup-docker-dev.sh
   ```

2. **Access development application:**
   - Frontend: http://localhost:4000 (with hot-reload)
   - Backend API: http://localhost:3000 (with hot-reload)

## Troubleshooting

### Database connection issues
```bash
# Check if DATABASE_URL is correctly set
grep DATABASE_URL .env

# Check server logs for connection errors
docker-compose logs server
```

### Port conflicts
If ports 80 or 3000 are already in use, modify the port mappings in `docker-compose.yml`:

```yaml
services:
  client:
    ports:
      - "8080:80"  # Change frontend port to 8080
  server:
    ports:
      - "3001:3000"  # Change backend port to 3001
```

### Build issues
If you encounter build issues:

```bash
# Clean up Docker system
docker system prune -a

# Remove all containers and rebuild
docker-compose down
docker-compose up --build --force-recreate
```

### Container logs
Check specific container logs for debugging:

```bash
# Backend logs
docker-compose logs server

# Frontend logs
docker-compose logs client
```

## Security Considerations

For production deployment:

1. **Never commit .env files** - they're already in .gitignore
2. Use environment variables for sensitive data
3. Configure proper firewall rules
4. Use HTTPS with proper SSL certificates
5. Regularly update container images
6. Secure your Supabase database properly

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (Nginx)       │────│   (Node.js)     │────│   (Supabase)    │
│   Port: 80      │    │   Port: 3000    │    │   Remote        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

The frontend serves the React app and proxies API requests to the backend, which connects to your Supabase PostgreSQL database for data persistence. 