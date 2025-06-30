#!/bin/bash

# PasteShare Docker Setup Script
echo "🚀 Setting up PasteShare with Docker..."

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
        echo "⚠️  Port $port is already in use. You may need to modify the port in docker-compose.yml"
        return 1
    fi
    return 0
}

echo "🔍 Checking if required ports are available..."
check_port 80
check_port 3000

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "📝 Please create a .env file with your Supabase DATABASE_URL:"
    echo ""
    echo "DATABASE_URL=postgresql://your_user:your_password@your_host:6543/postgres"
    echo "NODE_ENV=production"
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

# Build and start services
echo "🔨 Building and starting Docker containers..."
docker-compose down 2>/dev/null
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "🌐 Access your application:"
    echo "   Frontend: http://localhost"
    echo "   Backend API: http://localhost:3000"
    echo "   Database: Supabase (remote)"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker-compose logs -f"
    echo "   Stop services: docker-compose down"
    echo "   Restart services: docker-compose restart"
    echo ""
    echo "🎉 PasteShare is ready to use!"
else
    echo "❌ Some services failed to start. Check logs with: docker-compose logs"
    exit 1
fi 