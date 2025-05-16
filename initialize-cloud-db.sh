#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}PasteShare Cloud SQL Database Initialization${NC}"
echo -e "${YELLOW}=========================================${NC}"

# Install required Node.js dependencies
echo -e "${YELLOW}Installing required Node.js packages...${NC}"
npm install --no-save pg pg-hstore sequelize

# Step 1: Set up Cloud SQL Proxy
echo -e "${YELLOW}Step 1: Setting up Cloud SQL Proxy...${NC}"

# Set project ID
PROJECT_ID="coastal-bloom-460014-j6"
INSTANCE_NAME="pasteshare-db"
REGION="asia-south1"

# Make sure gcloud is configured
echo -e "${YELLOW}Checking gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Check if Cloud SQL Proxy is already installed
if command -v cloud-sql-proxy &> /dev/null; then
  echo -e "${GREEN}Cloud SQL Proxy is already installed.${NC}"
else
  # Install Cloud SQL Proxy based on the operating system
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${YELLOW}Installing Cloud SQL Proxy for Linux...${NC}"
    # Download the Cloud SQL Proxy
    curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.1/cloud-sql-proxy.linux.amd64
    chmod +x cloud-sql-proxy
    sudo mv cloud-sql-proxy /usr/local/bin/
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}Installing Cloud SQL Proxy for macOS...${NC}"
    # For macOS
    brew install cloud-sql-proxy
  else
    echo -e "${RED}Unsupported operating system. Please install Cloud SQL Proxy manually.${NC}"
    echo -e "${RED}See: https://cloud.google.com/sql/docs/postgres/connect-admin-proxy${NC}"
    exit 1
  fi
fi

# Ensure we have the necessary authentication for Application Default Credentials
echo -e "${YELLOW}Setting up Application Default Credentials...${NC}"
gcloud auth application-default login --no-launch-browser

# Make sure the instance exists and is running
echo -e "${YELLOW}Checking Cloud SQL instance...${NC}"
INSTANCE_INFO=$(gcloud sql instances describe $INSTANCE_NAME --format="value(name,state)")
if [[ -z "$INSTANCE_INFO" ]]; then
  echo -e "${RED}Cloud SQL instance '$INSTANCE_NAME' not found. Please check the instance name and try again.${NC}"
  exit 1
fi

echo -e "${GREEN}Cloud SQL instance found: $INSTANCE_INFO${NC}"

# Create a directory for the socket
mkdir -p /tmp/cloudsql

# Start Cloud SQL Proxy in the background
echo -e "${YELLOW}Starting Cloud SQL Proxy...${NC}"
instance_connection_name="$PROJECT_ID:$REGION:$INSTANCE_NAME"
cloud-sql-proxy --port=5432 "$instance_connection_name" &
PROXY_PID=$!

# Wait a moment for the proxy to establish connection
sleep 3

# Check if proxy is running
if kill -0 $PROXY_PID 2>/dev/null; then
  echo -e "${GREEN}Cloud SQL Proxy started successfully with PID: $PROXY_PID${NC}"
else
  echo -e "${RED}Failed to start Cloud SQL Proxy. Please check for errors and try again.${NC}"
  exit 1
fi

# Step 2: Initialize database schema
echo -e "${YELLOW}Step 2: Initializing database schema...${NC}"
echo -e "${YELLOW}Running database initialization script...${NC}"
node init-cloud-db-local.js

# Check if the initialization was successful
INIT_RESULT=$?
if [ $INIT_RESULT -eq 0 ]; then
  echo -e "${GREEN}Database initialization completed successfully!${NC}"
  echo -e "${GREEN}You can now deploy your application with ./fix-deploy-cloud-run.sh${NC}"
else
  echo -e "${RED}Database initialization failed. Please check the error messages above.${NC}"
fi

# Clean up: Kill the Cloud SQL Proxy process
echo -e "${YELLOW}Cleaning up: Stopping Cloud SQL Proxy...${NC}"
kill $PROXY_PID
wait $PROXY_PID 2>/dev/null || true
echo -e "${GREEN}Cloud SQL Proxy stopped.${NC}"

# Final exit
if [ $INIT_RESULT -eq 0 ]; then
  echo -e "${GREEN}All steps completed successfully!${NC}"
  exit 0
else
  echo -e "${RED}Initialization process failed.${NC}"
  exit 1
fi 