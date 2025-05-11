#!/bin/bash

# Define log colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the absolute path of the workspace directory
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="${WORKSPACE_DIR}/client"
SERVER_DIR="${WORKSPACE_DIR}/server"

echo -e "${GREEN}Starting PasteShare application...${NC}"

# Kill any existing processes that might be using our ports
echo -e "${YELLOW}Checking for processes using required ports...${NC}"
if command -v lsof >/dev/null 2>&1; then
  # Client port
  lsof -ti:4000 | xargs kill -9 2>/dev/null || true
  # Server port candidates
  for port in 3003 3004 3005 3006 3007 3008; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
  done
  echo -e "${GREEN}Ports cleared.${NC}"
else
  echo -e "${YELLOW}lsof not found. Skipping port check.${NC}"
fi

# Start server in background
echo -e "${GREEN}Starting server...${NC}"
cd "${SERVER_DIR}" && npm run dev &
SERVER_PID=$!

# Wait for server to initialize
echo -e "${YELLOW}Waiting for server to initialize...${NC}"
sleep 3

# Get the actual port from server-port.txt
if [ -f "${SERVER_DIR}/server-port.txt" ]; then
  SERVER_PORT=$(cat "${SERVER_DIR}/server-port.txt")
  echo -e "${GREEN}Detected server running on port ${SERVER_PORT}${NC}"
  
  # Copy the port file to client's public directory
  cp "${SERVER_DIR}/server-port.txt" "${CLIENT_DIR}/public/" 2>/dev/null || true
else
  # Wait a bit more for the port file to be created
  echo -e "${YELLOW}Waiting for server port file...${NC}"
  for i in {1..10}; do
    sleep 1
    if [ -f "${SERVER_DIR}/server-port.txt" ]; then
      SERVER_PORT=$(cat "${SERVER_DIR}/server-port.txt")
      echo -e "${GREEN}Detected server running on port ${SERVER_PORT}${NC}"
      cp "${SERVER_DIR}/server-port.txt" "${CLIENT_DIR}/public/" 2>/dev/null || true
      break
    fi
    echo -n "."
  done
  
  # If still no port file, use default
  if [ -z "${SERVER_PORT}" ]; then
    SERVER_PORT=3003
    echo -e "\n${YELLOW}Could not detect server port, assuming ${SERVER_PORT}${NC}"
  fi
fi

# Start client in background
echo -e "${GREEN}Starting client on port 4000...${NC}"
cd "${CLIENT_DIR}" && npm start &
CLIENT_PID=$!

# Function to handle script termination
cleanup() {
    echo -e "${YELLOW}Shutting down services...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    kill $CLIENT_PID 2>/dev/null || true
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

# Register the cleanup function for various signals
trap cleanup SIGINT SIGTERM

# Keep script running
echo -e "${GREEN}PasteShare is running.${NC}"
echo -e "${GREEN}Access the client at: http://localhost:4000${NC}"
echo -e "${GREEN}Server API available at: http://localhost:${SERVER_PORT}/api${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services.${NC}"
wait 