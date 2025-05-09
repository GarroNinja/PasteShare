#!/bin/bash

# Define color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print a step
print_step() {
  echo -e "${GREEN}==>${NC} $1"
}

# Function to print a warning
print_warning() {
  echo -e "${YELLOW}WARNING:${NC} $1"
}

# Function to print an error and exit
print_error() {
  echo -e "${RED}ERROR:${NC} $1"
  exit 1
}

# Ensure the script is run with the right permissions
if [[ $EUID -ne 0 && "$OSTYPE" != "darwin"* ]]; then
  print_warning "This script may need elevated privileges to run Docker commands."
  print_warning "If you encounter permission issues, try running with sudo."
fi

# Check prerequisites
print_step "Checking prerequisites..."

# Check for Docker
if ! command -v docker &> /dev/null; then
  print_error "Docker is not installed. Please install Docker to continue."
fi

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null; then
  print_warning "Docker Compose is not installed. It's recommended to install it."
  read -p "Do you want to continue without Docker Compose? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Deployment canceled."
  fi
fi

# Build the application
print_step "Building PasteShare application..."
if [ -f "docker-compose.yml" ]; then
  docker-compose build || print_error "Failed to build the application using Docker Compose."
else
  docker build -t pasteshare . || print_error "Failed to build the application using Docker."
fi

# Set up the environment
print_step "Setting up environment..."
if [ ! -f ".env.production" ]; then
  print_warning "No .env.production file found. Using default environment variables."
  
  # Create a default JWT secret if not provided
  JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 32)}
  
  # Create .env.production file
  cat > .env.production << EOL
NODE_ENV=production
PORT=3000
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
UPLOAD_DIR=./uploads
EOL
  
  print_step "Created .env.production with default values."
  print_warning "Make sure to update JWT_SECRET in production."
fi

# Start the application
print_step "Starting PasteShare application..."
if [ -f "docker-compose.yml" ]; then
  docker-compose up -d || print_error "Failed to start the application using Docker Compose."
else
  docker run -d -p 80:3000 --name pasteshare --env-file .env.production pasteshare || print_error "Failed to start the application using Docker."
fi

# Final message
print_step "PasteShare has been deployed successfully!"
print_step "You can access it at http://localhost (or your server's IP/domain)"
print_warning "Remember to set up a reverse proxy with HTTPS for production use."

exit 0 