#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up Cloud SQL Proxy for PasteShare...${NC}"

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

# Ensure we have the necessary authentication
echo -e "${YELLOW}Authenticating with Google Cloud...${NC}"
gcloud auth login --no-launch-browser

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

echo -e "${GREEN}Cloud SQL Proxy started with PID: $PROXY_PID${NC}"
echo -e "${GREEN}The proxy will remain running until you terminate it with Ctrl+C${NC}"
echo -e "${GREEN}You can now connect to your Cloud SQL instance on localhost:5432${NC}"
echo -e "${YELLOW}Database connection string will be: postgresql://postgres:YOUR_PASSWORD@localhost:5432/pasteshare${NC}"
echo -e "${YELLOW}When done, kill the proxy process with: kill $PROXY_PID${NC}"

# Wait for the proxy to terminate
wait $PROXY_PID 