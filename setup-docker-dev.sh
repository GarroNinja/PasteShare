#!/bin/bash

# PasteShare Docker Development Setup Script
echo "🚀 Setting up PasteShare for development with Docker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if ports are available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Port $port is already in use. You may need to modify the port in docker-compose.dev.yml"
        return 1
    fi
    return 0
}

echo "🔍 Checking if required ports are available..."
check_port 4000
check_port 3000

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "📝 Please create a .env file with your Supabase DATABASE_URL:"
    echo ""
    echo "DATABASE_URL=postgresql://your_user:your_password@your_host:6543/postgres"
    echo "NODE_ENV=development"
    echo "PORT=3000"
    echo "UPLOAD_DIR=/app/uploads"
    echo ""
    echo "See .env.example for reference."
    exit 1
fi

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL=" .env; then
    echo "❌ DATABASE_URL not found in .env file!"
    echo "📝 Please add your Supabase DATABASE_URL to the .env file."
    exit 1
fi

echo "✅ Configuration looks good!"

# Build and start services in development mode
echo "🔨 Building and starting Docker containers in development mode..."
docker-compose -f docker-compose.dev.yml down 2>/dev/null
docker-compose -f docker-compose.dev.yml up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Check if services are running
if docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
    echo "✅ Development services are running!"
    echo ""
    echo "🌐 Access your application:"
    echo "   Frontend (with hot-reload): http://localhost:4000"
    echo "   Backend API: http://localhost:3000"
    echo "   Database: Supabase (remote)"
    echo ""
    echo "🔥 Development features:"
    echo "   • Hot-reload enabled for both frontend and backend"
    echo "   • Source code changes are automatically reflected"
    echo "   • Development dependencies installed"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker-compose -f docker-compose.dev.yml logs -f"
    echo "   Stop services: docker-compose -f docker-compose.dev.yml down"
    echo "   Restart services: docker-compose -f docker-compose.dev.yml restart"
    echo ""
    echo "🎉 PasteShare development environment is ready!"
else
    echo "❌ Some services failed to start. Check logs with: docker-compose -f docker-compose.dev.yml logs"
    exit 1
fi 